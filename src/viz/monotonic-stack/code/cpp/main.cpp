// Test driver: "load v1 v2 ..." replaces the array; "next" prints each value's next greater
// value (-1 for none); "prev" prints each previous smaller value; "histogram" prints the
// largest rectangle.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "monotonic_stack.hpp"

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
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            a.clear();
            for (int v; in >> v;) a.push_back(v);
        } else if (cmd == "next") {
            print(nextGreater(a));
        } else if (cmd == "prev") {
            print(previousSmaller(a));
        } else if (cmd == "histogram") {
            std::cout << largestRectangle(a) << "\n";
        }
    }
}
