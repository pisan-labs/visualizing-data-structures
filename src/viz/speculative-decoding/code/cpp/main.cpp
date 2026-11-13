// Test driver: reads one operation per line, prints one result per line.
// "s <sentence>" adds a training sentence (no output). "round <k> <greedy|sample> <prefix ...> |
// <u ...>" runs one round with a bigram draft and a trigram target (the bigram where the trigram
// never saw the context) and prints the drafts accepted, a bar, and the words added.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "speculative.hpp"

int main() {
    std::vector<std::string> sentences;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "s") {
            std::string rest;
            std::getline(in >> std::ws, rest);
            sentences.push_back(rest);
        } else if (op == "round") {
            Model bigram = ngram_model(sentences, 2);
            Model trigram = ngram_model(sentences, 3);
            Model target = [&](const Words& ctx) {
                auto t = trigram(ctx);
                return t ? t : bigram(ctx);
            };
            int k;
            std::string mode, w;
            in >> k >> mode;
            Words prefix;
            while (in >> w && w != "|") prefix.push_back(w);
            std::vector<double> us;
            for (double u; in >> u;) us.push_back(u);
            size_t at = 0;
            Result r = speculative_step(
                prefix, k, bigram, target, [&] { return us.at(at++); }, mode == "greedy");
            std::cout << r.accepted << " |";
            for (const auto& x : r.words) std::cout << " " << x;
            std::cout << "\n";
        }
    }
}
