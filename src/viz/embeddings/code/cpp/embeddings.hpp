#pragma once
#include <algorithm>
#include <cmath>
#include <queue>
#include <set>
#include <string>
#include <utility>
#include <vector>

using Vec = std::pair<double, double>;

struct Word {
    std::string word;
    Vec v;
};

struct Scored {
    std::string word;
    size_t index;
    double score;
};

inline double dot(const Vec& a, const Vec& b) { return a.first * b.first + a.second * b.second; }

inline double length(const Vec& a) { return std::sqrt(a.first * a.first + a.second * a.second); }

// The cosine of the angle between a and b: 1 when they point the same way.
inline double cosine(const Vec& a, const Vec& b) { return dot(a, b) / (length(a) * length(b)); }

inline Vec normalize(const Vec& a) {
    double n = length(a);
    return {a.first / n, a.second / n};
}

// Whether a is the weaker neighbour: a lower score, or a tie and a later word.
inline bool weaker(const Scored& a, const Scored& b) {
    return a.score < b.score || (a.score == b.score && a.index > b.index);
}

// The k words most similar to target, best first. A min-heap keeps the best k seen so far
// with the weakest on top, so a word that cannot get in costs one comparison.
inline std::vector<Scored> nearest(const std::vector<Word>& words, const Vec& target, size_t k,
                                   bool use_cosine, const std::set<std::string>& leave_out) {
    auto stronger = [](const Scored& a, const Scored& b) { return weaker(b, a); };
    std::priority_queue<Scored, std::vector<Scored>, decltype(stronger)> heap(stronger);
    for (size_t i = 0; i < words.size(); i++) {
        if (leave_out.count(words[i].word)) continue;
        double s = use_cosine ? cosine(target, words[i].v) : dot(target, words[i].v);
        Scored e{words[i].word, i, s};
        if (heap.size() < k) {
            heap.push(e);
        } else if (weaker(heap.top(), e)) {
            heap.pop();
            heap.push(e);
        }
    }
    std::vector<Scored> best;
    for (; !heap.empty(); heap.pop()) best.push_back(heap.top());
    std::reverse(best.begin(), best.end());  // the heap gives the weakest first
    return best;
}

// a - b + c.
inline Vec analogy(const Vec& a, const Vec& b, const Vec& c) {
    return {a.first - b.first + c.first, a.second - b.second + c.second};
}
