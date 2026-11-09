// Test driver: reads one operation per line, prints one result per line.
//   dfa <states> / alphabet <symbols> / start <q> / accept <states> / move <p> <c> <q>
//                       a complete DFA (prints nothing)
//   classes             prints "eps a ab | eps-a->a eps-b->eps ...", or "more than 8 classes"
//   apart w1 w2 ...     prints the suffix for each pair (w2,w1) (w3,w1) (w3,w2) ..., - if none
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "nerode.hpp"

std::string name(const std::string& w) { return w.empty() ? "eps" : w; }

int main() {
    Dfa d;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, a, b, c;
        in >> op;
        if (op == "dfa") {
            d = Dfa{};
        } else if (op == "alphabet") {
            while (in >> a) d.alphabet.push_back(a[0]);
        } else if (op == "start") {
            in >> d.start;
        } else if (op == "accept") {
            while (in >> a) d.accept.insert(a);
        } else if (op == "move") {
            in >> a >> b >> c;
            d.delta[{a, b[0]}] = c;
        } else if (op == "classes") {
            auto r = classes(d);
            if (!r) {
                std::cout << "more than 8 classes\n";
                continue;
            }
            const auto& [words, moves] = *r;
            for (const auto& w : words) std::cout << name(w) << ' ';
            std::cout << '|';
            for (const Move& m : moves)
                std::cout << ' ' << name(words[m.from]) << '-' << m.on << "->" << name(words[m.to]);
            std::cout << '\n';
        } else if (op == "apart") {
            std::vector<std::string> words;
            while (in >> a) words.push_back(a == "eps" ? "" : a);
            std::string out;
            for (std::size_t i = 1; i < words.size(); i++)
                for (std::size_t j = 0; j < i; j++) {
                    auto z = apart(d, words[i], words[j]);
                    out += (out.empty() ? "" : " ") + (z ? name(*z) : "-");
                }
            std::cout << out << '\n';
        }
    }
}
