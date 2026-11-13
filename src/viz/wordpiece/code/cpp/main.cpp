// Test driver: reads one operation per line, prints one result per line.
// "reset" forgets the training words and "word <count> <letters>" adds one; neither prints.
// "train <k>" learns k merges from the start and "merge" one more; both print the merges as
// a+b, or "none". "encode <max length> <letters>" prints the pieces.
#include <iostream>
#include <sstream>
#include <string>

#include "wordpiece.hpp"

static std::string show(const std::vector<Pair>& ms) {
    std::string out;
    for (const Pair& p : ms) out += (out.empty() ? "" : " ") + p.first + "+" + p.second;
    return ms.empty() ? "none" : out;
}

int main() {
    std::vector<Word> start, words;
    std::vector<Pair> learned;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        Pieces rest;
        for (std::string t; in >> t;) rest.push_back(t);
        if (op == "reset") {
            start.clear();
            words.clear();
            learned.clear();
        } else if (op == "word") {
            start.push_back({split(Pieces(rest.begin() + 1, rest.end())), std::stoi(rest[0])});
            words = start;
        } else if (op == "train") {
            words = start;
            learned = train(words, std::stoi(rest[0]));
            std::cout << show(learned) << "\n";
        } else if (op == "merge") {
            auto more = train(words, 1);
            learned.insert(learned.end(), more.begin(), more.end());
            std::cout << show(more) << "\n";
        } else if (op == "encode") {
            std::set<std::string> vocab;
            for (const Word& w : start) vocab.insert(w.pieces.begin(), w.pieces.end());
            for (const Pair& m : learned) vocab.insert(join(m.first, m.second));
            Trie trie;
            buildTrie(trie, vocab);
            Pieces out = encode(Pieces(rest.begin() + 1, rest.end()), trie, std::stoul(rest[0]));
            for (size_t i = 0; i < out.size(); i++) std::cout << (i ? " " : "") << out[i];
            std::cout << "\n";
        }
    }
}
