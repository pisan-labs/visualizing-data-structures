// Byte-pair encoding: learn merges from a text's words, then encode new words with them.
#pragma once
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

using Tokens = std::vector<std::string>;
using Pair = std::pair<std::string, std::string>;

struct Word {
    Tokens tokens;
    int count;  // how often the word occurs in the text
};

const std::string END = "_";  // marks the end of a word

// A word as its characters (UTF-8, one or more bytes each), then the end-of-word marker.
inline Tokens split(const std::string& word) {
    Tokens out;
    for (unsigned char c : word) {
        if ((c & 0xC0) == 0x80) out.back() += static_cast<char>(c);  // continues a character
        else out.push_back(std::string(1, static_cast<char>(c)));
    }
    out.push_back(END);
    return out;
}

// Neighbouring pairs, each word counted as often as it occurs, in the order first met.
inline std::vector<std::pair<Pair, int>> countPairs(const std::vector<Word>& words) {
    std::vector<std::pair<Pair, int>> pairs;
    std::map<Pair, size_t> where;
    for (const Word& w : words)
        for (size_t i = 0; i + 1 < w.tokens.size(); i++) {
            auto [it, fresh] = where.emplace(Pair{w.tokens[i], w.tokens[i + 1]}, pairs.size());
            if (fresh) pairs.push_back({it->first, 0});
            pairs[it->second].second += w.count;
        }
    return pairs;
}

// Join every a followed by b into one token, left to right.
inline Tokens mergePair(const Tokens& tokens, const Pair& p) {
    Tokens out;
    for (size_t i = 0; i < tokens.size(); i++) {
        if (i + 1 < tokens.size() && tokens[i] == p.first && tokens[i + 1] == p.second) {
            out.push_back(p.first + p.second);
            i++;
        } else {
            out.push_back(tokens[i]);
        }
    }
    return out;
}

// Learns up to k merges and returns them in order; words are updated to the merged tokens.
inline std::vector<Pair> train(std::vector<Word>& words, int k, bool alphabetical) {
    std::vector<Pair> merges;
    for (int round = 0; round < k; round++) {
        auto pairs = countPairs(words);
        if (pairs.empty()) break;  // every word is a single token
        auto best = pairs[0];
        for (const auto& p : pairs)
            if (p.second > best.second ||
                (alphabetical && p.second == best.second && p.first < best.first))
                best = p;
        merges.push_back(best.first);
        for (Word& w : words) w.tokens = mergePair(w.tokens, best.first);
    }
    return merges;
}

// Replay the merges, in the order learned, on a new word's tokens.
inline Tokens encode(Tokens tokens, const std::vector<Pair>& merges,
                     const std::set<std::string>& alphabet) {
    for (auto& t : tokens)
        if (!alphabet.count(t)) t = "[UNK]";
    for (const Pair& p : merges) tokens = mergePair(tokens, p);
    return tokens;
}
