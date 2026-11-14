#pragma once
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

using Vec = std::vector<double>;

inline Vec softmax(const Vec& z) {
    double m = *std::max_element(z.begin(), z.end());
    Vec e(z.size());
    double total = 0;
    for (size_t k = 0; k < z.size(); k++) {
        e[k] = std::exp(z[k] - m);
        total += e[k];
    }
    for (double& x : e) x /= total;
    return e;
}

// The answer whose stretch of 0 to 1, in order, holds u.
inline int draw(const Vec& p, double u) {
    double cum = 0;
    for (size_t k = 0; k < p.size(); k++) {
        cum += p[k];
        if (u < cum) return static_cast<int>(k);
    }
    int k = static_cast<int>(p.size()) - 1;
    while (k > 0 && p[k] <= 0) k--;
    return k;
}

inline double mean(const Vec& xs) {
    double total = 0;
    for (double x : xs) total += x;
    return total / static_cast<double>(xs.size());
}

struct Advantages {
    Vec adv;     // how much better than expected each sample was
    Vec shaped;  // the rewards the critic learns from (with the KL penalty)
};

// REINFORCE: the reward itself. PPO: the reward minus the critic's value v. Both fold the KL
// penalty into the reward. GRPO: the reward against the group, (r - mean) / std, no critic.
inline Advantages advantages(const std::string& method, const Vec& rewards,
                             const std::vector<int>& group, const Vec& p_old, const Vec& p_ref,
                             double beta, double v) {
    size_t n = group.size();
    Vec r(n);
    for (size_t i = 0; i < n; i++) r[i] = rewards[group[i]];
    Vec adv(n);
    if (method == "grpo") {
        double m = mean(r);
        double sq = 0;
        for (double x : r) sq += (x - m) * (x - m);
        double sd = std::sqrt(sq / static_cast<double>(n));
        for (size_t i = 0; i < n; i++) adv[i] = sd > 0 ? (r[i] - m) / sd : 0;
        return {adv, r};
    }
    Vec shaped(n);
    for (size_t i = 0; i < n; i++) {
        shaped[i] = r[i] - beta * std::log(p_old[group[i]] / p_ref[group[i]]);
        adv[i] = method == "ppo" ? shaped[i] - v : shaped[i];
    }
    return {adv, shaped};
}

// One gradient step on the logits from a group of answers. A sample stops counting once its
// ratio pi/pi_old has left [1 - eps, 1 + eps] the way its advantage pushes (PPO's clip). GRPO
// also pulls toward p_ref. Fills `clipped` and returns the new logits.
inline Vec policy_pass(const std::string& method, const Vec& z, const Vec& p_old, const Vec& p_ref,
                       const std::vector<int>& group, const Vec& adv, double eps, double beta,
                       double lr, std::vector<bool>& clipped) {
    Vec p = softmax(z);
    Vec g(z.size(), 0.0);
    bool reinforce = method == "reinforce";
    clipped.assign(group.size(), false);
    for (size_t i = 0; i < group.size(); i++) {
        int a = group[i];
        double rho = reinforce ? 1 : p[a] / p_old[a];
        double A = adv[i];
        clipped[i] = !reinforce && ((A > 0 && rho > 1 + eps) || (A < 0 && rho < 1 - eps));
        if (!clipped[i]) {
            double coef = A * rho;
            for (size_t k = 0; k < z.size(); k++)
                g[k] += coef * ((static_cast<int>(k) == a ? 1 : 0) - p[k]);
        }
        if (method == "grpo") {
            double kc = -beta * (1 - p_ref[a] / p[a]);
            for (size_t k = 0; k < z.size(); k++)
                g[k] += kc * ((static_cast<int>(k) == a ? 1 : 0) - p[k]);
        }
    }
    Vec out(z.size());
    for (size_t k = 0; k < z.size(); k++)
        out[k] = z[k] + lr * (g[k] / static_cast<double>(group.size()));
    return out;
}

// DPO on logits: the loss -log sigmoid(h) for one preference pair. Returns h.
inline double dpo(Vec& z, const Vec& z_ref, int winner, int loser, double beta, double lr) {
    double h = beta * ((z[winner] - z_ref[winner]) - (z[loser] - z_ref[loser]));
    double sig = 1 / (1 + std::exp(-h));
    double step = lr * beta * (1 - sig);
    z[winner] = z[winner] + step;
    z[loser] = z[loser] - step;
    return h;
}
