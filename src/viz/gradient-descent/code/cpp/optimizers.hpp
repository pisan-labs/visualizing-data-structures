#pragma once
#include <cmath>
#include <vector>

using Vec = std::vector<double>;

// Gradient descent and two of its descendants. Each step takes the point x and the gradient g.
struct Optimizer {
    virtual ~Optimizer() = default;
    virtual Vec step(const Vec& x, const Vec& g) = 0;
};

struct GradientDescent : Optimizer {
    double lr;
    explicit GradientDescent(double lr) : lr(lr) {}

    Vec step(const Vec& x, const Vec& g) override {
        Vec out(x.size());
        for (size_t i = 0; i < x.size(); i++) out[i] = x[i] - lr * g[i];
        return out;
    }
};

// Polyak's heavy ball: a velocity that keeps beta of itself each step.
struct Momentum : Optimizer {
    double lr, beta;
    Vec v;
    Momentum(double lr, double beta) : lr(lr), beta(beta) {}

    Vec step(const Vec& x, const Vec& g) override {
        if (v.empty()) v.assign(x.size(), 0.0);
        Vec out(x.size());
        for (size_t i = 0; i < x.size(); i++) {
            v[i] = beta * v[i] - lr * g[i];
            out[i] = x[i] + v[i];
        }
        return out;
    }
};

// Kingma and Ba (2015): running averages of g and g squared.
struct Adam : Optimizer {
    double lr, beta1, beta2, eps = 1e-8;
    bool bias_correction;
    Vec m, s;
    double b1t = 1, b2t = 1;  // beta1^t and beta2^t
    Adam(double lr, double beta1, double beta2, bool bias_correction)
        : lr(lr), beta1(beta1), beta2(beta2), bias_correction(bias_correction) {}

    Vec step(const Vec& x, const Vec& g) override {
        if (m.empty()) {
            m.assign(x.size(), 0.0);
            s.assign(x.size(), 0.0);
        }
        b1t *= beta1;
        b2t *= beta2;
        Vec out(x.size());
        for (size_t i = 0; i < x.size(); i++) {
            m[i] = beta1 * m[i] + (1 - beta1) * g[i];
            s[i] = beta2 * s[i] + (1 - beta2) * g[i] * g[i];
            double m_hat = m[i], s_hat = s[i];
            if (bias_correction) {  // both averages start at 0
                m_hat /= 1 - b1t;
                s_hat /= 1 - b2t;
            }
            out[i] = x[i] - lr * m_hat / (std::sqrt(s_hat) + eps);
        }
        return out;
    }
};
