// Test driver: "load v1 v2 ..." replaces the array; "fixed k" prints "best start";
// "atleast S" prints the shortest length (0 for none); "distinct" prints "length start".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "sliding_window.hpp"

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
        } else if (cmd == "fixed") {
            int k;
            in >> k;
            auto [best, at] = maxSum(a, k);
            std::cout << best << " " << at << "\n";
        } else if (cmd == "atleast") {
            int s;
            in >> s;
            std::cout << shortestAtLeast(a, s) << "\n";
        } else if (cmd == "distinct") {
            auto [best, at] = longestDistinct(a);
            std::cout << best << " " << at << "\n";
        }
    }
}
