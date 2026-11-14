// Test driver: "load v1 v2 ..." replaces the list; "top k" prints the k largest from largest
// down; "kth k" prints the k-th largest.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "top_k.hpp"

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
        } else if (cmd == "top") {
            int k;
            in >> k;
            std::vector<int> top = topK(a, k);
            for (auto it = top.rbegin(); it != top.rend(); ++it)
                std::cout << (it == top.rbegin() ? "" : " ") << *it;
            std::cout << "\n";
        } else if (cmd == "kth") {
            int k;
            in >> k;
            std::cout << kthLargest(a, k) << "\n";
        }
    }
}
