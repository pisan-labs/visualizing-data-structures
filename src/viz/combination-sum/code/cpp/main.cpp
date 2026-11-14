// Test driver: "again t v1 v2 ..." (each candidate as often as you like) or "once t v1 v2 ..."
// (each at most once) prints every combination that sums to t, in the order found, such as
// "[3,3,4] [3,7] [5,5]", or "none".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "combination_sum.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string mode;
        int target;
        if (!(in >> mode >> target)) continue;
        std::vector<int> values;
        for (int v; in >> v;) values.push_back(v);
        auto found = combinationSum(values, target, mode == "again");
        std::string text;
        for (const auto& combo : found) {
            if (!text.empty()) text += ' ';
            text += '[';
            for (std::size_t i = 0; i < combo.size(); ++i) {
                if (i) text += ',';
                text += std::to_string(combo[i]);
            }
            text += ']';
        }
        std::cout << (found.empty() ? "none" : text) << "\n";
    }
}
