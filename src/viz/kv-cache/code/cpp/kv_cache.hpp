#pragma once
#include <algorithm>
#include <cmath>
#include <deque>
#include <limits>
#include <utility>
#include <vector>

using Vector = std::vector<double>;
using Matrix = std::vector<Vector>;

// a (n x m) times b (m x p).
inline Matrix matmul(const Matrix& a, const Matrix& b) {
    Matrix out(a.size(), Vector(b[0].size()));
    for (size_t i = 0; i < a.size(); i++)
        for (size_t j = 0; j < b[0].size(); j++) {
            double s = 0;
            for (size_t t = 0; t < b.size(); t++) s += a[i][t] * b[t][j];
            out[i][j] = s;
        }
    return out;
}

inline Vector row(const Vector& x, const Matrix& w) { return matmul({x}, w)[0]; }

// One query against the keys it may see: scaled scores, softmax, a blend of the values.
template <typename Rows>
Vector attend(const Vector& q, const Rows& keys, const Rows& values) {
    size_t m = keys.size(), dk = q.size();
    Vector a(m);
    double max = -std::numeric_limits<double>::infinity();
    for (size_t j = 0; j < m; j++) {
        double s = 0;
        for (size_t t = 0; t < dk; t++) s += q[t] * keys[j][t];
        a[j] = s / std::sqrt(static_cast<double>(dk));
        max = std::max(max, a[j]);
    }
    double total = 0;
    for (double& x : a) {
        x = std::exp(x - max);  // softmax, largest score subtracted first
        total += x;
    }
    for (double& x : a) x /= total;
    Vector z(values[0].size());
    for (size_t c = 0; c < z.size(); c++) {
        double s = 0;
        for (size_t j = 0; j < m; j++) s += a[j] * values[j][c];
        z[c] = s;
    }
    return z;
}

// The key and value of every token so far, one row each, oldest first.
class KVCache {
public:
    KVCache(Matrix wq, Matrix wk, Matrix wv, size_t window)  // window 0 keeps every token
        : wq_(std::move(wq)), wk_(std::move(wk)), wv_(std::move(wv)), window_(window) {}

    size_t size() const { return keys_.size(); }

    // The whole prompt at once. Returns every prompt token's output.
    Matrix prefill(const Matrix& xs) {
        Matrix q = matmul(xs, wq_), k = matmul(xs, wk_), v = matmul(xs, wv_);
        Matrix out;
        for (size_t i = 0; i < xs.size(); i++) {
            size_t lo = window_ && i + 1 > window_ ? i + 1 - window_ : 0;  // tokens lo..i only
            out.push_back(attend(q[i], Matrix(k.begin() + lo, k.begin() + i + 1),
                                 Matrix(v.begin() + lo, v.begin() + i + 1)));
        }
        for (size_t i = 0; i < xs.size(); i++) append(k[i], v[i]);
        return out;
    }

    // One new token: one new row of K and one of V, then attend over the cache.
    Vector decode(const Vector& x) {
        append(row(x, wk_), row(x, wv_));
        return attend(row(x, wq_), keys_, values_);
    }

private:
    void append(const Vector& k, const Vector& v) {
        keys_.push_back(k);
        values_.push_back(v);
        if (window_ && keys_.size() > window_) {  // evict the oldest
            keys_.pop_front();
            values_.pop_front();
        }
    }

    Matrix wq_, wk_, wv_;
    size_t window_;
    std::deque<Vector> keys_, values_;
};

// The last token's output, computing the key and value of every token it sees again.
inline Vector decode_without_cache(const Matrix& xs, const Matrix& wq, const Matrix& wk,
                                   const Matrix& wv, size_t window) {
    size_t lo = window && xs.size() > window ? xs.size() - window : 0;
    Matrix seen(xs.begin() + lo, xs.end());
    return attend(row(xs.back(), wq), matmul(seen, wk), matmul(seen, wv));
}
