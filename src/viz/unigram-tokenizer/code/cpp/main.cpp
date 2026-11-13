// Test driver: reads one operation per line, prints one result per line.
// "text <word> <count> ..." sets the training words (no output). "seed <size>" builds the seed
// vocabulary and prints its pieces of two or more letters. "encode <word>" prints the best split,
// a bar, and its log-probability. "prune <floor>" prints the pieces one round removes, or "-".
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "unigram.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string joined(const std::vector<std::string>& xs) {
    std::string s;
    for (const auto& x : xs) s += (s.empty() ? "" : " ") + x;
    return s.empty() ? "-" : s;
}

int main() {
    Text text;
    Vocab vocab;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "text") {
            text = Text{};
            std::string w;
            int c;
            while (in >> w >> c) {
                text.words.push_back(w);
                text.counts.push_back(c);
            }
        } else if (op == "seed") {
            int size;
            in >> size;
            vocab = seed_vocab(text, size);
            std::vector<std::string> longer;
            for (const auto& [x, c] : vocab)
                if (x.size() > 1) longer.push_back(x);
            std::cout << joined(longer) << "\n";
        } else if (op == "encode") {
            std::string w;
            in >> w;
            Split s = viterbi(w, log_probs(vocab));
            std::cout << joined(s.pieces) << " | " << three(s.score) << "\n";
        } else if (op == "prune") {
            int floor;
            in >> floor;
            std::cout << joined(prune(text, vocab, floor)) << "\n";
        }
    }
}
