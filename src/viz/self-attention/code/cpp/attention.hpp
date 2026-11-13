#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

using Matrix = std::vector<std::vector<double>>;

// a (n x m) times b (m x p).
inline Matrix matmul(const Matrix& a, const Matrix& b) {
    Matrix out(a.size(), std::vector<double>(b[0].size()));
    for (size_t i = 0; i < a.size(); i++)
        for (size_t j = 0; j < b[0].size(); j++) {
            double s = 0;
            for (size_t t = 0; t < b.size(); t++) s += a[i][t] * b[t][j];
            out[i][j] = s;
        }
    return out;
}

// Weights that add up to 1. Subtracting the largest score keeps exp from overflowing.
inline std::vector<double> softmax(const std::vector<double>& scores) {
    double m = *std::max_element(scores.begin(), scores.end());
    std::vector<double> e(scores.size());
    double total = 0;
    for (size_t j = 0; j < scores.size(); j++) {
        e[j] = std::exp(scores[j] - m);
        total += e[j];
    }
    for (double& x : e) x /= total;
    return e;
}

struct AttentionResult {
    Matrix a;  // the weights, one row per word
    Matrix z;  // the outputs
};

// One head of scaled dot-product attention. x holds one row per word; wq, wk and wv turn a
// row into its query, key and value.
inline AttentionResult self_attention(const Matrix& x, const Matrix& wq, const Matrix& wk,
                                      const Matrix& wv, bool causal = true, bool scale = true) {
    Matrix q = matmul(x, wq), k = matmul(x, wk), v = matmul(x, wv);
    size_t n = x.size(), dk = wq[0].size();
    Matrix a;
    for (size_t i = 0; i < n; i++) {
        std::vector<double> scores(n);
        for (size_t j = 0; j < n; j++) {
            double s = 0;
            for (size_t t = 0; t < dk; t++) s += q[i][t] * k[j][t];  // q_i . k_j
            if (scale) s /= std::sqrt(static_cast<double>(dk));
            if (causal && j > i) s = -std::numeric_limits<double>::infinity();  // no peeking
            scores[j] = s;
        }
        a.push_back(softmax(scores));
    }
    return {a, matmul(a, v)};
}
