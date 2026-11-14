// Test driver: "solve c00 c01 ... / c10 c11 ... / ..." reads a cost table row by row (one row
// per worker) and prints the least total, then the task of each worker.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "assignment.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.rfind("solve ", 0) != 0) continue;
        std::vector<std::vector<int>> cost;
        std::istringstream rows(line.substr(6));
        for (std::string row; std::getline(rows, row, '/');) {
            std::istringstream in(row);
            std::vector<int> r;
            for (int v; in >> v;) r.push_back(v);
            cost.push_back(r);
        }
        std::vector<int> out = cheapest(cost);
        for (std::size_t k = 0; k < out.size(); k++) std::cout << (k ? " " : "") << out[k];
        std::cout << "\n";
    }
}
