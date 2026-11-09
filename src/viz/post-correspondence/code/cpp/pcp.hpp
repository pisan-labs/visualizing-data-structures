#pragma once
#include <algorithm>
#include <deque>
#include <string>
#include <utility>
#include <vector>

// The Post correspondence problem: dominoes with a string on top and one below.
struct Domino {
    std::string top, bottom;
};

// Where the two strings first disagree, or -1 if one is a prefix of the other.
inline int mismatch(const std::string& top, const std::string& bottom) {
    std::size_t k = std::min(top.size(), bottom.size());
    for (std::size_t i = 0; i < k; i++)
        if (top[i] != bottom[i]) return static_cast<int>(i);
    return -1;
}

// The longer side and what it has left over, such as "top +ca".
inline std::string overhang(const std::string& top, const std::string& bottom) {
    std::size_t k = std::min(top.size(), bottom.size());
    return top.size() > k ? "top +" + top.substr(k) : "bottom +" + bottom.substr(k);
}

// Lays down the dominoes numbered in seq (from 1), stopping where the strings disagree.
inline std::string trySequence(const std::vector<Domino>& ds, const std::vector<int>& seq) {
    std::string top, bottom;
    for (int i : seq) {
        top += ds[i - 1].top;
        bottom += ds[i - 1].bottom;
        int at = mismatch(top, bottom);
        if (at >= 0) return "dead at column " + std::to_string(at + 1);
    }
    return top == bottom ? "match" : "alive " + overhang(top, bottom);
}

// Breadth-first search for a match of at most `bound` dominoes. Returns "match 2 1 3" (domino
// numbers from 1), "no match" when every branch died, "none up to <bound>" when some partial
// match was cut off at the bound, or "gave up" after extending `limit` partial matches.
inline std::string search(const std::vector<Domino>& ds, std::size_t bound, int limit = 60) {
    struct Partial {
        std::vector<int> seq;
        std::string top, bottom;
    };
    std::deque<Partial> queue{Partial{}};
    int cut = 0, expanded = 0;
    while (!queue.empty()) {
        if (expanded == limit) return "gave up";
        Partial p = std::move(queue.front());
        queue.pop_front();
        expanded++;
        for (std::size_t i = 0; i < ds.size(); i++) {
            Partial q{p.seq, p.top + ds[i].top, p.bottom + ds[i].bottom};
            q.seq.push_back(static_cast<int>(i) + 1);
            if (mismatch(q.top, q.bottom) >= 0) continue;  // dead: nothing added later can fix it
            if (q.top == q.bottom) {
                std::string out = "match";
                for (int k : q.seq) out += " " + std::to_string(k);
                return out;
            }
            if (q.seq.size() == bound) cut++;  // alive, but as long as allowed
            else queue.push_back(std::move(q));
        }
    }
    return cut > 0 ? "none up to " + std::to_string(bound) : "no match";
}
