#pragma once
#include <deque>
#include <functional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

using Moves = std::function<std::vector<std::string>(const std::string&)>;
using Allowed = std::function<bool(const std::string&)>;

// BFS over states made on the fly: the fewest moves from start to goal, or -1.
inline int fewestMoves(const std::string& start, const std::string& goal, const Moves& moves,
                       const Allowed& allowed) {
    if (start == goal) return 0;
    std::unordered_map<std::string, int> dist{{start, 0}};  // the visited set, with distances
    std::deque<std::string> queue{start};
    while (!queue.empty()) {
        std::string s = queue.front();
        queue.pop_front();
        for (const std::string& t : moves(s)) {  // the graph is never stored: make them now
            if (!allowed(t) || dist.count(t)) continue;
            if (t == goal) return dist[s] + 1;
            dist[t] = dist[s] + 1;
            queue.push_back(t);
        }
    }
    return -1;
}

// Turn each wheel up, then down; 9 wraps round to 0.
inline std::vector<std::string> turns(const std::string& s) {
    std::vector<std::string> out;
    for (std::size_t i = 0; i < s.size(); ++i) {
        for (int step : {1, -1}) {
            std::string t = s;
            t[i] = static_cast<char>('0' + (s[i] - '0' + step + 10) % 10);
            out.push_back(t);
        }
    }
    return out;
}

// Change one letter at a time, a to z.
inline std::vector<std::string> letterChanges(const std::string& w) {
    std::vector<std::string> out;
    for (std::size_t i = 0; i < w.size(); ++i) {
        for (char c = 'a'; c <= 'z'; ++c) {
            if (c == w[i]) continue;
            std::string t = w;
            t[i] = c;
            out.push_back(t);
        }
    }
    return out;
}

// Fewest turns from all zeros to goal, never showing a barred combination.
inline int lockMoves(const std::vector<std::string>& barred, const std::string& goal) {
    std::unordered_set<std::string> bar(barred.begin(), barred.end());
    return fewestMoves(std::string(goal.size(), '0'), goal, turns,
                       [&](const std::string& t) { return !bar.count(t); });
}

// Fewest one-letter changes from words[0] to goal, every step a word in the list.
inline int wordMoves(const std::vector<std::string>& words, const std::string& goal) {
    std::unordered_set<std::string> known(words.begin(), words.end());
    return fewestMoves(words[0], goal, letterChanges,
                       [&](const std::string& t) { return known.count(t) > 0; });
}
