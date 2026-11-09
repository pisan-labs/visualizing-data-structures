#pragma once
#include <deque>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

// The Myhill–Nerode classes of the language of a complete DFA.
struct Dfa {
    std::vector<char> alphabet;  // in order
    std::string start;
    std::set<std::string> accept;
    std::map<std::pair<std::string, char>, std::string> delta;

    std::string run(const std::string& word) const {
        std::string q = start;
        for (char c : word) q = delta.at({q, c});
        return q;
    }
};

// The shortest suffix z with exactly one of xz and yz in L, or nothing if x ≡ y: a
// breadth-first search over pairs of states, symbols in alphabet order.
inline std::optional<std::string> apart(const Dfa& d, const std::string& x, const std::string& y) {
    using Pair = std::pair<std::string, std::string>;
    std::deque<std::pair<Pair, std::string>> queue{{{d.run(x), d.run(y)}, ""}};
    std::set<Pair> seen{queue.front().first};
    while (!queue.empty()) {
        auto [pq, z] = queue.front();
        queue.pop_front();
        if (d.accept.count(pq.first) != d.accept.count(pq.second)) return z;
        for (char c : d.alphabet) {
            Pair next{d.delta.at({pq.first, c}), d.delta.at({pq.second, c})};
            if (seen.insert(next).second) queue.push_back({next, z + c});
        }
    }
    return std::nullopt;
}

struct Move {
    int from;
    char on;
    int to;
};

// The classes of ≡_L, each named by its shortest word, and the moves between them; nothing when
// there are more than `most` classes.
inline std::optional<std::pair<std::vector<std::string>, std::vector<Move>>> classes(
    const Dfa& d, std::size_t most = 8) {
    std::vector<std::string> words{""};
    std::vector<Move> moves;
    for (std::size_t i = 0; i < words.size(); i++)
        for (char c : d.alphabet) {
            std::string x = words[i] + c;
            std::size_t j = 0;
            while (j < words.size() && apart(d, x, words[j])) j++;
            if (j == words.size()) {  // told apart from every class so far: a new class
                if (words.size() == most) return std::nullopt;
                words.push_back(x);
            }
            moves.push_back({static_cast<int>(i), c, static_cast<int>(j)});
        }
    return std::make_pair(words, moves);
}
