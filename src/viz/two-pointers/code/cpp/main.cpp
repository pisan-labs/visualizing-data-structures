// Test driver: "load v1 v2 ..." replaces the array; "pair t" prints "lo hi" or "none";
// "water" prints the most water; "dedupe" keeps a[0..k-1] and prints "k: ...";
// "reverse" prints the reversed array.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "two_pointers.hpp"

static void print(const std::vector<int>& a) {
    for (std::size_t i = 0; i < a.size(); ++i) std::cout << (i ? " " : "") << a[i];
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
        } else if (cmd == "pair") {
            int t;
            in >> t;
            auto f = pairSum(a, t);
            if (f) std::cout << f->first << " " << f->second << "\n";
            else std::cout << "none\n";
        } else if (cmd == "water") {
            std::cout << maxWater(a) << "\n";
        } else if (cmd == "dedupe") {
            int k = removeDuplicates(a);
            a.resize(k);
            std::cout << k << ": ";
            print(a);
            std::cout << "\n";
        } else if (cmd == "reverse") {
            reverseInPlace(a);
            print(a);
            std::cout << "\n";
        }
    }
}
