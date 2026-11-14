// Test driver: "load v1 v2 ..." replaces the array; "sort" sorts it with cyclic sort and prints
// the values, then "| missing | repeated" ("-" for an empty list).
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "cyclic_sort.hpp"

std::string show(const std::vector<int>& xs) {
    if (xs.empty()) return "-";
    std::string out;
    for (int x : xs) out += (out.empty() ? "" : " ") + std::to_string(x);
    return out;
}

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
        } else if (cmd == "sort") {
            auto [missing, repeated] = missingAndRepeated(a);
            std::cout << show(a) << " | " << show(missing) << " | " << show(repeated) << "\n";
        }
    }
}
