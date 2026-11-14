#pragma once
#include <algorithm>
#include <cmath>
#include <functional>
#include <map>
#include <string>
#include <utility>
#include <vector>

using Vec = std::vector<double>;
using Vectors = std::map<std::string, Vec>;
// The noise distribution, in the order the words were counted.
using Noise = std::vector<std::pair<std::string, double>>;

inline double sigmoid(double x) { return 1 / (1 + std::exp(-x)); }

inline double dot(const Vec& a, const Vec& b) {
    double s = 0;
    for (size_t i = 0; i < a.size(); i++) s += a[i] * b[i];
    return s;
}

// (center, context) for each word and every other word at most `window` away.
inline std::vector<std::pair<std::string, std::string>> pairs(
    const std::vector<std::string>& words, int window) {
    std::vector<std::pair<std::string, std::string>> out;
    int n = static_cast<int>(words.size());
    for (int i = 0; i < n; i++)
        for (int j = std::max(0, i - window); j <= std::min(n - 1, i + window); j++)
            if (j != i) out.emplace_back(words[i], words[j]);
    return out;
}

// P(n) proportional to count(n)^0.75: common words, but less dominant.
inline Noise noise_distribution(const std::vector<std::pair<std::string, int>>& counts) {
    Noise out;
    double total = 0;
    for (const auto& [w, c] : counts) {
        double x = std::pow(c, 0.75);
        out.emplace_back(w, x);
        total += x;
    }
    for (auto& e : out) e.second /= total;
    return out;
}

// The word whose stretch of the cumulative distribution holds u in [0, 1).
inline std::string draw(const Noise& noise, double u) {
    double cum = 0;
    for (const auto& [w, p] : noise) {
        cum += p;
        if (u < cum) return w;
    }
    return noise.back().first;
}

// k distinct noise words, never the pair's own words.
inline std::vector<std::string> negatives(const Noise& noise, int k, const std::string& center,
                                          const std::string& context,
                                          const std::function<double()>& uniform) {
    std::vector<std::string> out;
    while (static_cast<int>(out.size()) < k) {
        std::string n = draw(noise, uniform());
        if (n != center && n != context && std::find(out.begin(), out.end(), n) == out.end())
            out.push_back(n);
    }
    return out;
}

// One step: pull c[context] toward w[center] (want the sigmoid of their dot product to be 1),
// push each noise word's c away (want 0), then move w[center] by the sum. Returns the
// sigmoids before the update.
inline std::vector<double> update(Vectors& w, Vectors& c, const std::string& center,
                                  const std::string& context,
                                  const std::vector<std::string>& noise_words, double lr) {
    Vec v = w[center];
    Vec grad(v.size(), 0.0);
    std::vector<std::string> targets{context};
    targets.insert(targets.end(), noise_words.begin(), noise_words.end());
    std::vector<double> sigmas;
    for (size_t m = 0; m < targets.size(); m++) {
        Vec& ct = c[targets[m]];
        double s = sigmoid(dot(v, ct));
        double g = s - (m == 0 ? 1 : 0);
        for (size_t i = 0; i < v.size(); i++) {
            grad[i] += g * ct[i];
            ct[i] = ct[i] - lr * g * v[i];
        }
        sigmas.push_back(s);
    }
    for (size_t i = 0; i < v.size(); i++) w[center][i] = v[i] - lr * grad[i];
    return sigmas;
}
