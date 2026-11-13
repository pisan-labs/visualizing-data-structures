// One transformer block (pre- or post-norm), then the unembedding, following the last word.
#pragma once
#include <cmath>
#include <limits>
#include <map>
#include <string>
#include <vector>

using Vec = std::vector<double>;
using Matrix = std::vector<Vec>;
using Weights = std::map<std::string, Matrix>;

constexpr double EPS = 1e-5;

// a (n x m) times b (m x p), each sum in index order.
inline Matrix matmul(const Matrix& a, const Matrix& b) {
    Matrix out(a.size(), Vec(b[0].size()));
    for (size_t i = 0; i < a.size(); i++)
        for (size_t j = 0; j < b[0].size(); j++) {
            double s = 0;
            for (size_t t = 0; t < b.size(); t++) s += a[i][t] * b[t][j];
            out[i][j] = s;
        }
    return out;
}

inline Vec times(const Vec& v, const Matrix& m) { return matmul(Matrix{v}, m)[0]; }

inline Vec add(const Vec& a, const Vec& b) {
    Vec out(a.size());
    for (size_t i = 0; i < a.size(); i++) out[i] = a[i] + b[i];
    return out;
}

// LayerNorm or RMSNorm with gamma = 1 and beta = 0.
inline Vec norm(const Vec& v, const std::string& kind) {
    double d = static_cast<double>(v.size()), mean = 0, q = 0;
    if (kind == "layer") {
        double s = 0;
        for (double x : v) s += x;
        mean = s / d;
        for (double x : v) q += (x - mean) * (x - mean);
    } else {
        for (double x : v) q += x * x;
    }
    double scale = std::sqrt(q / d + EPS);
    Vec out(v.size());
    for (size_t i = 0; i < v.size(); i++) out[i] = (v[i] - mean) / scale;
    return out;
}

inline Vec softmax(const Vec& scores) {
    double m = -std::numeric_limits<double>::infinity();
    for (double s : scores) m = std::max(m, s);
    Vec e(scores.size());
    double total = 0;
    for (size_t j = 0; j < scores.size(); j++) {
        e[j] = std::exp(scores[j] - m);
        total += e[j];
    }
    for (double& x : e) x /= total;
    return e;
}

inline double gelu(double x) {
    return 0.5 * x * (1 + std::tanh(std::sqrt(2 / 3.14159265358979323846) * (x + 0.044715 * x * x * x)));
}

inline double silu(double x) { return x / (1 + std::exp(-x)); }

inline Vec feed_forward(const Vec& v, Weights& w, const std::string& act) {
    if (act == "swiglu") {
        Vec g = times(v, w["wg"]), u = times(v, w["wu"]), h(g.size());
        for (size_t i = 0; i < g.size(); i++) h[i] = silu(g[i]) * u[i];
        return times(h, w["wd"]);
    }
    Vec g = add(times(v, w["w1"]), w["b1"][0]), h(g.size());
    for (size_t i = 0; i < g.size(); i++)
        h[i] = act == "relu" ? (g[i] > 0 ? g[i] : 0) : gelu(g[i]);
    return add(times(h, w["w2"]), w["b2"][0]);
}

struct BlockResult {
    Vec a, x1, x2, logits;  // the last word's weights, the stream after each sublayer
};

inline BlockResult block(const Matrix& x, Weights& w, const std::string& order,
                         const std::string& kind, const std::string& act) {
    size_t n = x.size(), last = n - 1;
    Matrix in = x;
    if (order == "pre")
        for (auto& row : in) row = norm(row, kind);
    // One causal head.
    Matrix q = matmul(in, w["q"]), k = matmul(in, w["k"]), v = matmul(in, w["v"]), a(n);
    size_t dk = q[0].size();
    for (size_t i = 0; i < n; i++) {
        Vec scores(n);
        for (size_t j = 0; j < n; j++) {
            double s = 0;
            for (size_t t = 0; t < dk; t++) s += q[i][t] * k[j][t];
            scores[j] = j <= i ? s / std::sqrt(static_cast<double>(dk))
                               : -std::numeric_limits<double>::infinity();
        }
        a[i] = softmax(scores);
    }
    Vec attn = matmul(matmul(a, v), w["o"])[last];
    Vec x1, x2, h;
    if (order == "pre") {
        x1 = add(x[last], attn);                            // x1 = x + attn(norm(x))
        x2 = add(x1, feed_forward(norm(x1, kind), w, act));  // x2 = x1 + ffn(norm(x1))
        h = norm(x2, kind);                                  // the final norm
    } else {
        x1 = norm(add(x[last], attn), kind);              // x1 = norm(x + attn(x))
        x2 = norm(add(x1, feed_forward(x1, w, act)), kind);  // x2 = norm(x1 + ffn(x1))
        h = x2;
    }
    return {a[last], x1, x2, times(h, w["u"])};
}
