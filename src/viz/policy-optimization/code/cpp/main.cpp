// Test driver: reads one operation per line, prints one result per line.
// "ref", "logits", "rewards" (four numbers each) and "critic v" set the state.
// "rl method eps beta u1..u4" draws a group and updates; it prints the group | the advantages
// | which samples the last pass clipped | the new policy | v. "dpo beta u..." draws pairs from
// the reference until their rewards differ, updates, and prints winner loser | h | the policy.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "policy.hpp"

static const double LR = 0.5;
static const int PASSES = 2;

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string line(const Vec& xs) {
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + three(xs[i]);
    return out;
}

static Vec numbers(std::istringstream& in) {
    Vec out;
    double x;
    while (in >> x) out.push_back(x);
    return out;
}

int main() {
    Vec z_ref, z, rewards;
    double v = 0;
    std::string text;
    while (std::getline(std::cin, text)) {
        std::istringstream in(text);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "ref") {
            z_ref = numbers(in);
        } else if (op == "logits") {
            z = numbers(in);
        } else if (op == "rewards") {
            rewards = numbers(in);
        } else if (op == "critic") {
            in >> v;
        } else if (op == "rl") {
            std::string method;
            double eps, beta;
            in >> method >> eps >> beta;
            Vec us = numbers(in);
            Vec p_old = softmax(z), p_ref = softmax(z_ref);
            std::vector<int> group;
            for (double u : us) group.push_back(draw(p_old, u));
            Advantages a = advantages(method, rewards, group, p_old, p_ref, beta, v);
            std::vector<bool> clipped;
            int passes = method == "reinforce" ? 1 : PASSES;
            for (int k = 0; k < passes; k++)
                z = policy_pass(method, z, p_old, p_ref, group, a.adv, eps, beta, LR, clipped);
            // The critic moves halfway to the group's average reward.
            if (method == "ppo") v = v + 0.5 * (mean(a.shaped) - v);
            std::string g, flags;
            for (size_t i = 0; i < group.size(); i++) g += (i ? " " : "") + std::to_string(group[i]);
            for (bool c : clipped) flags += c ? '1' : '0';
            std::cout << g << " | " << line(a.adv) << " | " << (method == "reinforce" ? "-" : flags)
                      << " | " << line(softmax(z)) << " | " << three(v) << "\n";
        } else if (op == "dpo") {
            double beta;
            in >> beta;
            Vec us = numbers(in);
            Vec p_ref = softmax(z_ref);
            size_t next = 0;
            int x = draw(p_ref, us[next++]);
            int y = draw(p_ref, us[next++]);
            while (rewards[x] == rewards[y]) {
                x = draw(p_ref, us[next++]);
                y = draw(p_ref, us[next++]);
            }
            int w = rewards[x] > rewards[y] ? x : y;
            int l = w == x ? y : x;
            double h = dpo(z, z_ref, w, l, beta, LR);
            std::cout << w << " " << l << " | " << three(h) << " | " << line(softmax(z)) << "\n";
        }
    }
}
