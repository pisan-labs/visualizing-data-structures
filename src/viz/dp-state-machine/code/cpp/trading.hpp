#pragma once
#include <algorithm>
#include <climits>
#include <string>
#include <utility>
#include <vector>

constexpr long long NEG = LLONG_MIN / 4;  // a state you cannot be in

// A trade: "buy" or "sell", on a day counted from 1.
using Trade = std::pair<std::string, int>;

// Most money from trading one item, holding at most one, and the trades that make it.
inline std::pair<long long, std::vector<Trade>> bestPlan(const std::vector<int>& prices,
                                                        bool cooldown, int fee) {
    const int n = prices.size();
    std::vector<long long> free(n + 1, 0);    // holding nothing at the end of day t
    std::vector<long long> hold(n + 1, NEG);  // holding the item
    std::vector<long long> cool(n + 1, NEG);  // sold on day t, so day t + 1 is a rest
    for (int t = 1; t <= n; ++t) {
        const int p = prices[t - 1];
        hold[t] = std::max(hold[t - 1], free[t - 1] - p);  // keep it, or buy today
        if (cooldown) {
            free[t] = std::max(free[t - 1], cool[t - 1]);  // rest, or rest after a sale
            cool[t] = hold[t - 1] + p - fee;               // sell today
        } else {
            free[t] = std::max(free[t - 1], hold[t - 1] + p - fee);  // rest, or sell today
        }
    }
    std::string state = cooldown && cool[n] > free[n] ? "cool" : "free";
    const long long best = std::max(free[n], cool[n]);
    std::vector<Trade> plan;
    for (int t = n; t >= 1; --t) {  // walk back: which way in made each value?
        if (state == "hold") {
            if (hold[t] != hold[t - 1]) {
                plan.push_back({"buy", t});
                state = "free";
            }
        } else if (state == "cool") {
            plan.push_back({"sell", t});
            state = "hold";
        } else if (free[t] != free[t - 1]) {
            if (cooldown) {
                state = "cool";
            } else {
                plan.push_back({"sell", t});
                state = "hold";
            }
        }
    }
    std::reverse(plan.begin(), plan.end());
    return {best, plan};
}
