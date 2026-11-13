// WordPiece: build a vocabulary from a text's words, then split words by longest match.
// A word is a vector of its letters (each a UTF-8 string), so accented letters are one letter.
#pragma once
#include <map>
#include <memory>
#include <set>
#include <string>
#include <utility>
#include <vector>

using Pieces = std::vector<std::string>;
using Pair = std::pair<std::string, std::string>;

struct Word {
    Pieces pieces;
    int count;  // how often the word occurs in the text
};

const std::string UNK = "[UNK]";

// The first letter as it is, every other letter as a ## piece.
inline Pieces split(const Pieces& letters) {
    Pieces out;
    for (size_t i = 0; i < letters.size(); i++) out.push_back((i ? "##" : "") + letters[i]);
    return out;
}

// The piece a merge makes: b loses its ##.
inline std::string join(const std::string& a, const std::string& b) {
    return a + (b.rfind("##", 0) == 0 ? b.substr(2) : b);
}

inline Pieces mergePair(const Pieces& pieces, const Pair& p) {
    Pieces out;
    for (size_t i = 0; i < pieces.size(); i++) {
        if (i + 1 < pieces.size() && pieces[i] == p.first && pieces[i + 1] == p.second) {
            out.push_back(join(p.first, p.second));
            i++;
        } else {
            out.push_back(pieces[i]);
        }
    }
    return out;
}

// Learns up to k merges and returns them in order; words are updated to the merged pieces.
inline std::vector<Pair> train(std::vector<Word>& words, int k) {
    std::vector<Pair> merges;
    for (int round = 0; round < k; round++) {
        std::map<std::string, int> count;
        std::vector<std::pair<Pair, int>> pairs;  // in the order first met
        std::map<Pair, size_t> where;
        for (const Word& w : words) {
            for (const auto& p : w.pieces) count[p] += w.count;
            for (size_t i = 0; i + 1 < w.pieces.size(); i++) {
                auto [it, fresh] = where.emplace(Pair{w.pieces[i], w.pieces[i + 1]}, pairs.size());
                if (fresh) pairs.push_back({it->first, 0});
                pairs[it->second].second += w.count;
            }
        }
        if (pairs.empty()) break;  // every word is one piece
        Pair best;
        double bestScore = -1;
        for (const auto& [p, c] : pairs) {
            double score = static_cast<double>(c) / (static_cast<double>(count[p.first]) * count[p.second]);
            if (score > bestScore) {  // strictly better, so a tie keeps the pair met first
                best = p;
                bestScore = score;
            }
        }
        merges.push_back(best);
        for (Word& w : words) w.pieces = mergePair(w.pieces, best);
    }
    return merges;
}

// A trie of the vocabulary, one level per letter, for pieces that start a word (start) and
// for ## pieces (inner).
struct Node {
    std::map<std::string, std::unique_ptr<Node>> kids;
    bool end = false;  // a piece ends here
};

struct Trie {
    Node start, inner;
};

// The letters of a UTF-8 string.
inline Pieces letters(const std::string& s) {
    Pieces out;
    for (unsigned char c : s) {
        if ((c & 0xC0) == 0x80) out.back() += static_cast<char>(c);
        else out.push_back(std::string(1, static_cast<char>(c)));
    }
    return out;
}

inline void buildTrie(Trie& t, const std::set<std::string>& vocab) {
    for (const std::string& piece : vocab) {
        bool inner = piece.rfind("##", 0) == 0;
        Node* node = inner ? &t.inner : &t.start;
        for (const auto& ch : letters(inner ? piece.substr(2) : piece)) {
            auto& kid = node->kids[ch];
            if (!kid) kid = std::make_unique<Node>();
            node = kid.get();
        }
        node->end = true;
    }
}

// Greedy longest match first, as BERT does it.
inline Pieces encode(const Pieces& word, const Trie& trie, size_t maxLen) {
    if (word.size() > maxLen) return {UNK};
    Pieces pieces;
    size_t start = 0;
    while (start < word.size()) {
        const Node* node = start == 0 ? &trie.start : &trie.inner;
        size_t last = 0;  // 0: no piece found yet
        for (size_t i = start; i < word.size(); i++) {
            auto it = node->kids.find(word[i]);
            if (it == node->kids.end()) break;
            node = it->second.get();  // walk down the trie
            if (node->end) last = i + 1;  // the longest piece so far
        }
        if (last == 0) return {UNK};  // nothing fits: the whole word is unknown
        std::string piece = start > 0 ? "##" : "";
        for (size_t i = start; i < last; i++) piece += word[i];
        pieces.push_back(piece);
        start = last;
    }
    return pieces;
}
