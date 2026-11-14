// Test driver: "load v1 v2 ..." replaces the array; "count k" prints how many subarrays sum
// to k; "longest k" prints "length start" of the longest one ("0 -1" for none).
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "prefix_sums.hpp"

int main() {
    std::vector<int> a;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            a.clear();
            for (int v; in >> v;) a.push_back(v);
        } else if (cmd == "count") {
            int k;
            in >> k;
            std::cout << countSumK(a, k) << "\n";
        } else if (cmd == "longest") {
            int k;
            in >> k;
            auto [best, start] = longestSumK(a, k);
            std::cout << best << " " << start << "\n";
        }
    }
}
