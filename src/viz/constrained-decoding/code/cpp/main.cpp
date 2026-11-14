// Test driver: reads one operation per line, prints one result per line.
// "dfa <start> <accept,...> <state,...> <from:symbol:to> ..." sets the DFA, "vocab <token> ..."
// the tokens and "logits <prev> <logit> ..." the model's row after a token (none print).
// "index" prints each state's allowed tokens. "next <prev> <state> <greedy|sample> <mask 1|0>
// <u>" prints the token chosen and the state it leads to ("dead" if it leaves the DFA).
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "constrained.hpp"

static std::vector<std::string> split(const std::string& s, char sep) {
    std::vector<std::string> out;
    std::stringstream in(s);
    for (std::string part; std::getline(in, part, sep);) out.push_back(part);
    return out;
}

int main() {
    Dfa dfa;
    std::vector<std::string> vocab;
    std::map<std::string, std::vector<double>> rows;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "dfa") {
            std::string accept, states, move;
            dfa = Dfa{};
            in >> dfa.start >> accept >> states;
            for (const auto& q : split(accept, ',')) dfa.accept.insert(q);
            dfa.states = split(states, ',');
            while (in >> move) {
                auto m = split(move, ':');
                dfa.delta[{m[0], m[1][0]}] = m[2];
            }
        } else if (op == "vocab") {
            vocab.clear();
            for (std::string t; in >> t;) vocab.push_back(t);
        } else if (op == "logits") {
            std::string prev;
            in >> prev;
            auto& row = rows[prev];
            row.clear();
            for (double v; in >> v;) row.push_back(v);
        } else if (op == "index") {
            auto index = build_index(dfa, vocab);
            for (size_t i = 0; i < dfa.states.size(); i++) {
                const auto& q = dfa.states[i];
                std::cout << (i ? " | " : "") << q << ":";
                for (const auto& [t, to] : index[q]) std::cout << " " << (t == END ? t : t + ">" + to);
            }
            std::cout << "\n";
        } else if (op == "next") {
            std::string prev, state, mode, mask;
            double u;
            in >> prev >> state >> mode >> mask >> u;
            bool dead = state == "dead";
            auto index = build_index(dfa, vocab);
            const Row* allowed = mask == "1" && !dead ? &index[state] : nullptr;
            std::string t = next_token(vocab, rows[prev], allowed, mode == "greedy", u);
            std::optional<std::string> to = t == END ? std::optional<std::string>(state)
                                            : dead   ? std::nullopt
                                                     : walk(dfa, state, t);
            std::cout << t << " " << (to ? *to : "dead") << "\n";
        }
    }
}
