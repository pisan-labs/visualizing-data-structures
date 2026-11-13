// Test driver: reads one operation per line, prints one result per line.
// "reset" forgets the training words; "word <count> <tokens>" adds one, already split;
// "known <tokens>" adds starting symbols no word has (all 256 bytes). None of these print.
// "train <k> first|alpha" learns k merges from the start and "merge first|alpha" one more;
// both print the merges as a+b, or "none". "encode <tokens>" prints the tokens.
#include <iostream>
#include <sstream>
#include <string>

#include "bpe.hpp"

static std::string show(const std::vector<Pair>& ms) {
    std::string out;
    for (const Pair& p : ms) out += (out.empty() ? "" : " ") + p.first + "+" + p.second;
    return ms.empty() ? "none" : out;
}

int main() {
    std::vector<Word> start, words;
    std::vector<Pair> learned;
    std::set<std::string> alphabet;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        Tokens rest;
        for (std::string t; in >> t;) rest.push_back(t);
        if (op == "reset") {
            start.clear();
            words.clear();
            learned.clear();
            alphabet.clear();
        } else if (op == "word") {
            Tokens tokens(rest.begin() + 1, rest.end());
            start.push_back({tokens, std::stoi(rest[0])});
            words = start;
            alphabet.insert(tokens.begin(), tokens.end());
        } else if (op == "known") {
            alphabet.insert(rest.begin(), rest.end());
        } else if (op == "train") {
            words = start;
            learned = train(words, std::stoi(rest[0]), rest[1] == "alpha");
            std::cout << show(learned) << "\n";
        } else if (op == "merge") {
            auto more = train(words, 1, rest[0] == "alpha");
            learned.insert(learned.end(), more.begin(), more.end());
            std::cout << show(more) << "\n";
        } else if (op == "encode") {
            Tokens out = encode(rest, learned, alphabet);
            for (size_t i = 0; i < out.size(); i++) std::cout << (i ? " " : "") << out[i];
            std::cout << "\n";
        }
    }
}
