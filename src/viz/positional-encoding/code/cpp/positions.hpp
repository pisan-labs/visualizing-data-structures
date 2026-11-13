#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

using Matrix = std::vector<std::vector<double>>;

constexpr double BASE = 10000;

// Pair i turns pos / 10000^(2i/d) radians: each pair slower than the last.
inline double angle(int pos, int i, int d) { return pos / std::pow(BASE, 2.0 * i / d); }

// Vaswani et al.: row pos is sin, cos of each pair's angle, added to the embedding.
inline Matrix sinusoidal(int n, int d) {
    Matrix pe(n, std::vector<double>(d));
    for (int pos = 0; pos < n; pos++)
        for (int i = 0; i < d / 2; i++) {
            pe[pos][2 * i] = std::sin(angle(pos, i, d));
            pe[pos][2 * i + 1] = std::cos(angle(pos, i, d));
        }
    return pe;
}

// RoPE: turn each pair (v[2i], v[2i+1]) of a query or key by its angle at pos.
inline std::vector<double> rotate(const std::vector<double>& v, int pos) {
    std::vector<double> out(v.size());
    int d = static_cast<int>(v.size());
    for (int i = 0; i < d / 2; i++) {
        double a = angle(pos, i, d);
        double x = v[2 * i], y = v[2 * i + 1];
        out[2 * i] = x * std::cos(a) - y * std::sin(a);
        out[2 * i + 1] = x * std::sin(a) + y * std::cos(a);
    }
    return out;
}

inline double dot(const std::vector<double>& a, const std::vector<double>& b) {
    double s = 0;
    for (size_t t = 0; t < a.size(); t++) s += a[t] * b[t];
    return s;
}

// Every query against every key, each turned by its own position.
inline Matrix rope_scores(const Matrix& q, const Matrix& k) {
    Matrix s(q.size(), std::vector<double>(k.size()));
    for (size_t m = 0; m < q.size(); m++)
        for (size_t n = 0; n < k.size(); n++)
            s[m][n] = dot(rotate(q[m], static_cast<int>(m)), rotate(k[n], static_cast<int>(n)));
    return s;
}

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

// Press et al.: no position vectors; the score of query i for key j gets -slope * (i - j),
// and keys after the query are masked.
inline Matrix alibi_attention(const Matrix& q, const Matrix& k, double slope) {
    int n = static_cast<int>(q.size());
    Matrix a;
    for (int i = 0; i < n; i++) {
        std::vector<double> scores(n);
        for (int j = 0; j < n; j++)
            scores[j] = j <= i ? dot(q[i], k[j]) / std::sqrt(static_cast<double>(q[i].size())) +
                                     -slope * (i - j)
                               : -std::numeric_limits<double>::infinity();
        a.push_back(softmax(scores));
    }
    return a;
}
