// Test driver: "load v1 v2 ..." replaces the array; "max k" prints the maximum of every
// window of k values; "min k" prints every window's minimum.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "monotonic_queue.hpp"

static void print(const std::vector<int>& a) {
    for (std::size_t i = 0; i < a.size(); ++i) std::cout << (i ? " " : "") << a[i];
    std::cout << "\n";
}

int main() {
    std::vector<int> a;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        int k = 0;
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            a.clear();
            for (int v; in >> v;) a.push_back(v);
        } else if (cmd == "max" && in >> k) {
            print(windowMax(a, k));
        } else if (cmd == "min" && in >> k) {
            print(windowMin(a, k));
        }
    }
}
