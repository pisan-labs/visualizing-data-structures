// Test driver: "ship d w1 w2 ..." prints the smallest capacity that ships the weights in d
// days; "spread k p1 p2 ..." prints the largest gap k items can keep on the positions.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "search_answer.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        int n;
        if (!(in >> cmd >> n)) continue;
        std::vector<int> values;
        for (int v; in >> v;) values.push_back(v);
        if (cmd == "ship")
            std::cout << smallestCapacity(values, n) << "\n";
        else if (cmd == "spread")
            std::cout << largestGap(values, n) << "\n";
    }
}
