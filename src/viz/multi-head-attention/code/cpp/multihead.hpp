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

struct MultiHeadResult {
    std::vector<Matrix> a;  // each head's weights
    Matrix o;               // the output
};

// Causal attention with h query heads and h_kv key/value heads. wq is d_model x d_model, cut
// into h heads of d = d_model / h columns; wk and wv are d_model x (h_kv * d), one block of d
// columns per key/value head. Query head i reads key/value head i / (h / h_kv): h_kv = h is
// multi-head attention, h_kv = 1 multi-query, in between grouped-query.
inline MultiHeadResult multi_head_attention(const Matrix& x, const Matrix& wq, const Matrix& wk,
                                            const Matrix& wv, const Matrix& wo, size_t h,
                                            size_t h_kv) {
    Matrix q = matmul(x, wq), k = matmul(x, wk), v = matmul(x, wv);
    size_t n = x.size(), d = wq[0].size() / h, group = h / h_kv;
    MultiHeadResult r;
    Matrix z(n, std::vector<double>(h * d));
    for (size_t i = 0; i < h; i++) {
        size_t g = i / group;  // the key/value head this query head reads
        Matrix a;
        for (size_t row = 0; row < n; row++) {
            std::vector<double> scores(n);
            for (size_t c = 0; c < n; c++) {
                double s = 0;
                for (size_t t = 0; t < d; t++) s += q[row][i * d + t] * k[c][g * d + t];
                scores[c] = c <= row ? s / std::sqrt(static_cast<double>(d))
                                     : -std::numeric_limits<double>::infinity();
            }
            a.push_back(softmax(scores));
        }
        for (size_t row = 0; row < n; row++)  // this head's output goes next to the others
            for (size_t t = 0; t < d; t++) {
                double s = 0;
                for (size_t c = 0; c < n; c++) s += a[row][c] * v[c][g * d + t];
                z[row][i * d + t] = s;
            }
        r.a.push_back(a);
    }
    r.o = matmul(z, wo);
    return r;
}
