// Test driver: "single v ...", "missing v ..." and "two v ..." print the answer (the two
// singles smaller first); "swap i j v ..." prints the list after swapping.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "xor_tricks.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        std::vector<int> nums;
        for (int v; in >> v;) nums.push_back(v);
        if (cmd == "single") {
            std::cout << single(nums) << '\n';
        } else if (cmd == "missing") {
            std::cout << missing(nums) << '\n';
        } else if (cmd == "two") {
            auto [a, b] = twoSingles(nums);
            std::cout << a << ' ' << b << '\n';
        } else if (cmd == "swap") {
            std::vector<int> values(nums.begin() + 2, nums.end());
            xorSwap(values, static_cast<std::size_t>(nums[0]), static_cast<std::size_t>(nums[1]));
            for (std::size_t k = 0; k < values.size(); k++) std::cout << (k ? " " : "") << values[k];
            std::cout << '\n';
        }
    }
}
