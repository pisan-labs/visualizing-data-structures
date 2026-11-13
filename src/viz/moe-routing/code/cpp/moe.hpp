// Mixture-of-experts routing: token choice (top-k, with capacity) or expert choice.
#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <string>
#include <vector>

using Vec = std::vector<double>;
using Matrix = std::vector<Vec>;

struct Assignment {
    int token, expert;
    double weight;  // the gate weight
    bool kept;      // false when the expert was full
};

struct Routed {
    std::vector<Assignment> assignments;
    int capacity;
    double loss;  // Switch Transformer's load-balance loss
};

inline Vec softmax(const Vec& scores) {
    double m = -std::numeric_limits<double>::infinity();
    for (double s : scores) m = std::max(m, s);
    Vec e(scores.size());
    double total = 0;
    for (size_t j = 0; j < scores.size(); j++) {
        e[j] = std::exp(scores[j] - m);
        total += e[j];
    }
    for (double& v : e) v /= total;
    return e;
}

// Indices of the count largest values, largest first, ties to the lower index.
inline std::vector<int> top(const Vec& xs, int count) {
    std::vector<int> left, out;
    for (int i = 0; i < static_cast<int>(xs.size()); i++) left.push_back(i);
    while (static_cast<int>(out.size()) < count && !left.empty()) {
        double best = -std::numeric_limits<double>::infinity();
        for (int i : left) best = std::max(best, xs[i]);
        int pick = *std::find_if(left.begin(), left.end(),
                                 [&](int i) { return xs[i] >= best - 1e-12; });
        out.push_back(pick);
        left.erase(std::find(left.begin(), left.end(), pick));
    }
    return out;
}

inline Routed route(const Matrix& x, const Matrix& w, int k, double cf,
                    const std::string& routing) {
    int T = static_cast<int>(x.size()), E = static_cast<int>(w[0].size());
    Matrix logits(T, Vec(E)), p(T);
    for (int t = 0; t < T; t++) {
        for (int e = 0; e < E; e++) {
            double s = 0;
            for (size_t f = 0; f < w.size(); f++) s += x[t][f] * w[f][e];
            logits[t][e] = s;
        }
        p[t] = softmax(logits[t]);
    }
    int cap = static_cast<int>(std::ceil(cf * k * T / E));
    std::vector<int> wanted(E, 0), load(E, 0);
    std::vector<Assignment> out;
    if (routing == "token") {
        std::vector<std::vector<int>> choices(T);
        Matrix gates(T);
        for (int t = 0; t < T; t++) {
            choices[t] = top(logits[t], k);
            Vec chosen;
            for (int e : choices[t]) {
                chosen.push_back(logits[t][e]);
                wanted[e]++;
            }
            gates[t] = softmax(chosen);
        }
        for (int r = 0; r < k; r++)  // every first choice before any second choice
            for (int t = 0; t < T; t++) {
                int e = choices[t][r];
                out.push_back({t, e, gates[t][r], load[e] < cap});
                load[e]++;
            }
    } else {  // expert choice: each expert takes the cap tokens that want it most
        for (int e = 0; e < E; e++) {
            Vec col(T);
            for (int t = 0; t < T; t++) col[t] = p[t][e];
            for (int t : top(col, cap)) {
                out.push_back({t, e, p[t][e], true});
                wanted[e]++;
            }
        }
    }
    int total = 0;
    for (int c : wanted) total += c;
    double loss = 0;
    for (int e = 0; e < E; e++) {
        double f = static_cast<double>(wanted[e]) / total;  // share of the assignments
        double s = 0;
        for (int t = 0; t < T; t++) s += p[t][e];
        loss += f * (s / T);  // times the mean router probability
    }
    return {out, cap, E * loss};
}
