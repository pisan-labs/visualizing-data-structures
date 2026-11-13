#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <string>
#include <vector>

// Probabilities from logits. Subtracting the largest keeps exp from overflowing.
inline std::vector<double> softmax(const std::vector<double>& logits, double temperature) {
    double m = -std::numeric_limits<double>::infinity();
    for (double x : logits) m = std::max(m, x / temperature);
    std::vector<double> e(logits.size());
    double total = 0;
    for (size_t i = 0; i < logits.size(); i++) {
        e[i] = std::exp(logits[i] / temperature - m);
        total += e[i];
    }
    for (double& x : e) x /= total;
    return e;
}

// Token indices, largest probability first; ties keep their order (the sort is stable).
inline std::vector<size_t> most_likely_first(const std::vector<double>& p) {
    std::vector<size_t> order(p.size());
    std::iota(order.begin(), order.end(), 0);
    std::stable_sort(order.begin(), order.end(), [&](size_t a, size_t b) { return p[a] > p[b]; });
    return order;
}

// The tokens that survive, most likely first.
inline std::vector<size_t> cut(const std::vector<double>& p, const std::string& strategy,
                               size_t k, double top_p, double min_p) {
    std::vector<size_t> order = most_likely_first(p);
    if (strategy == "greedy") return {order[0]};
    if (strategy == "top-k") return {order.begin(), order.begin() + std::min(k, order.size())};
    std::vector<size_t> kept;
    if (strategy == "top-p") {
        double mass = 0;
        for (size_t i : order) {
            kept.push_back(i);
            mass += p[i];
            if (mass >= top_p) break;  // the fewest tokens with at least top_p between them
        }
        return kept;
    }
    if (strategy == "min-p") {
        double floor = min_p * p[order[0]];
        for (size_t i : order)
            if (p[i] >= floor) kept.push_back(i);
        return kept;
    }
    return order;  // plain sampling keeps every token
}

// The kept tokens' probabilities scaled to add up to 1; every other token gets 0.
inline std::vector<double> renormalize(const std::vector<double>& p,
                                       const std::vector<size_t>& kept) {
    double mass = 0;
    for (size_t i : kept) mass += p[i];
    std::vector<double> q(p.size(), 0.0);
    for (size_t i : kept) q[i] = p[i] / mass;
    return q;
}

// Lay the kept tokens end to end on [0, 1) and return the one whose stretch holds u.
inline size_t draw(const std::vector<double>& q, const std::vector<size_t>& kept, double u) {
    double cum = 0;
    for (size_t i : kept) {
        cum += q[i];
        if (u < cum) return i;
    }
    return kept.back();  // u past the last total by rounding
}
