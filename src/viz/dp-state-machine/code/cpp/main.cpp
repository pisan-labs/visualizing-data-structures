// Test driver: "best c f p1 p2 ..." prints the most money from trading one item at prices
// p1..pn, with a cooldown when c is 1 and a fee f per sale; "plan c f p1 p2 ..." prints it and
// the trades ("7 buy 2 sell 4"), or "0 none" when no trade pays.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "trading.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        int cooldown, fee;
        if (!(in >> cmd >> cooldown >> fee)) continue;
        std::vector<int> prices;
        for (int p; in >> p;) prices.push_back(p);
        const auto [best, plan] = bestPlan(prices, cooldown == 1, fee);
        std::cout << best;
        if (cmd == "plan") {
            if (plan.empty()) std::cout << " none";
            for (const auto& [action, day] : plan) std::cout << " " << action << " " << day;
        }
        std::cout << "\n";
    }
}
