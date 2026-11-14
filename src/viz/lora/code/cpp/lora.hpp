#pragma once
#include <cmath>
#include <vector>

using Matrix = std::vector<std::vector<double>>;

inline Matrix matmul(const Matrix& x, const Matrix& y) {
    Matrix out(x.size(), std::vector<double>(y[0].size()));
    for (size_t i = 0; i < x.size(); i++)
        for (size_t j = 0; j < y[0].size(); j++) {
            double s = 0;
            for (size_t t = 0; t < y.size(); t++) s += x[i][t] * y[t][j];
            out[i][j] = s;
        }
    return out;
}

// A frozen d x d matrix W plus a trainable low-rank update (alpha / r) * B * A. B is d x r and
// starts at zero; A is r x d and starts small and random, so the update starts at zero and the
// layer starts unchanged.
struct LoRA {
    static constexpr double BETA1 = 0.9, BETA2 = 0.999, EPS = 1e-8;

    Matrix w;     // frozen: never trained
    Matrix b, a;  // the only trained numbers: 2 * d * r of them
    double scale, lr;
    Matrix mb, vb, ma, va;  // Adam's averages for B and for A
    double p1 = 1, p2 = 1;  // beta1^t and beta2^t

    LoRA(Matrix w_, Matrix b_, Matrix a_, double alpha, double lr_ = 0.1)
        : w(std::move(w_)), b(std::move(b_)), a(std::move(a_)), scale(alpha / a.size()), lr(lr_) {
        mb = vb = Matrix(b.size(), std::vector<double>(b[0].size()));
        ma = va = Matrix(a.size(), std::vector<double>(a[0].size()));
    }

    // The update the adapter adds to W.
    Matrix delta() const {
        Matrix p = matmul(b, a);
        for (auto& row : p)
            for (double& x : row) x = scale * x;
        return p;
    }

    // Sum of squared differences between the update and the target update.
    double loss(const Matrix& target) const {
        Matrix dw = delta();
        double total = 0;
        for (size_t i = 0; i < dw.size(); i++)
            for (size_t j = 0; j < dw[i].size(); j++) {
                double e = dw[i][j] - target[i][j];
                total += e * e;
            }
        return total;
    }

    void train_step(const Matrix& target) {
        size_t d = b.size(), r = a.size();
        Matrix g = delta();
        for (size_t i = 0; i < d; i++)
            for (size_t j = 0; j < d; j++) g[i][j] = 2 * (g[i][j] - target[i][j]);
        Matrix gb(d, std::vector<double>(r));  // dLoss/dB = scale * g * A^T
        for (size_t i = 0; i < d; i++)
            for (size_t k = 0; k < r; k++) {
                double s = 0;
                for (size_t j = 0; j < d; j++) s += g[i][j] * a[k][j];
                gb[i][k] = scale * s;
            }
        Matrix ga(r, std::vector<double>(d));  // dLoss/dA = scale * B^T * g
        for (size_t k = 0; k < r; k++)
            for (size_t j = 0; j < d; j++) {
                double s = 0;
                for (size_t i = 0; i < d; i++) s += b[i][k] * g[i][j];
                ga[k][j] = scale * s;
            }
        p1 *= BETA1;
        p2 *= BETA2;
        adam(b, gb, mb, vb);
        adam(a, ga, ma, va);
    }

    void adam(Matrix& p, const Matrix& g, Matrix& m, Matrix& v) const {
        for (size_t i = 0; i < p.size(); i++)
            for (size_t j = 0; j < p[i].size(); j++) {
                m[i][j] = BETA1 * m[i][j] + (1 - BETA1) * g[i][j];
                v[i][j] = BETA2 * v[i][j] + (1 - BETA2) * g[i][j] * g[i][j];
                double mh = m[i][j] / (1 - p1), vh = v[i][j] / (1 - p2);
                p[i][j] -= lr * mh / (std::sqrt(vh) + EPS);
            }
    }

    // W + update: one matrix again, so serving costs what it did before.
    Matrix merge() const {
        Matrix dw = delta(), out = w;
        for (size_t i = 0; i < w.size(); i++)
            for (size_t j = 0; j < w[i].size(); j++) out[i][j] = w[i][j] + dw[i][j];
        return out;
    }
};
