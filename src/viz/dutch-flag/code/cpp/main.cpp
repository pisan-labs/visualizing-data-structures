// Test driver: "load v1 v2 ..." replaces the array; "partition p" partitions it in place and
// prints the values, then "| low high".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "three_way.hpp"

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
        } else if (cmd == "partition") {
            int p;
            in >> p;
            auto [low, high] = threeWayPartition(a, p);
            for (int v : a) std::cout << v << " ";
            std::cout << "| " << low << " " << high << "\n";
        }
    }
}
