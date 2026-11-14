// Test driver: "count g" prints how many paths cross the grid g (rows split by /, a digit per
// cell, # for a wall); "cost g" prints the cheapest path's cost; "path g" prints the cost and
// the moves (D, R). Both print "none" when walls block every path.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "grid_paths.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd, text;
        if (!(in >> cmd >> text)) continue;
        std::vector<std::string> grid;
        std::istringstream rows(text);
        for (std::string row; std::getline(rows, row, '/');) grid.push_back(row);
        if (cmd == "count") {
            std::cout << countPaths(grid) << "\n";
            continue;
        }
        const auto best = cheapestPath(grid);
        if (!best) {
            std::cout << "none\n";
        } else if (cmd == "cost") {
            std::cout << best->first << "\n";
        } else {
            std::cout << best->first;
            for (char m : best->second) std::cout << " " << m;
            std::cout << "\n";
        }
    }
}
