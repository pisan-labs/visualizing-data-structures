// Test driver: "merge 1 8 12 | 3 4 10 | 2 9" prints the merged list.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "k_way_merge.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd) || cmd != "merge") continue;
        std::vector<std::vector<int>> lists(1);
        for (std::string t; in >> t;) {
            if (t == "|")
                lists.emplace_back();
            else
                lists.back().push_back(std::stoi(t));
        }
        std::vector<int> out = mergeLists(lists);
        for (std::size_t i = 0; i < out.size(); ++i) std::cout << (i ? " " : "") << out[i];
        std::cout << "\n";
    }
}
