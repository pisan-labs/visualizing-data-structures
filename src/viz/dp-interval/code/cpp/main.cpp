// Test driver: "best v1 v2 ..." prints the best total for taking the tiles; "order v1 ..."
// prints it and the order (positions from 1); "cost s1 s2 ..." prints the least cost to merge
// the piles; "tree s1 ..." prints it and the merges as brackets.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "intervals.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        std::vector<int> xs;
        for (int x; in >> x;) xs.push_back(x);
        if (xs.empty()) continue;
        if (cmd == "best" || cmd == "order") {
            const auto [best, order] = bestRemoval(xs);
            std::cout << best;
            if (cmd == "order")
                for (int k : order) std::cout << " " << k;
            std::cout << "\n";
        } else {
            const auto [cost, tree] = cheapestMerge(xs);
            std::cout << cost;
            if (cmd == "tree") std::cout << " " << tree;
            std::cout << "\n";
        }
    }
}
