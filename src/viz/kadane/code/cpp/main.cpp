// Test driver: "load v1 v2 ..." replaces the array; "max" prints "best lo hi" of the maximum
// subarray; "max_or_empty" does the same with the empty subarray allowed ("0 0 -1").
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "kadane.hpp"

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
        } else if (cmd == "max" || cmd == "max_or_empty") {
            Best b = maxSubarray(a, cmd == "max_or_empty");
            std::cout << b.sum << " " << b.lo << " " << b.hi << "\n";
        }
    }
}
