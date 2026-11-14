// Test driver: "most s-f ..." prints the most intervals open at once; "skyline s-f:h ..."
// prints the skyline's key points as x,h separated by spaces.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "sweep.hpp"

// "2-5" or "2-5:7" as numbers.
std::vector<int> numbers(std::string t) {
    for (char& c : t)
        if (c == '-' || c == ':') c = ' ';
    std::istringstream in(t);
    std::vector<int> out;
    for (int v; in >> v;) out.push_back(v);
    return out;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd, t;
        if (!(in >> cmd)) continue;
        if (cmd == "most") {
            std::vector<std::pair<int, int>> ivs;
            while (in >> t) {
                auto v = numbers(t);
                ivs.push_back({v[0], v[1]});
            }
            std::cout << mostOpen(ivs) << '\n';
        } else if (cmd == "skyline") {
            std::vector<std::array<int, 3>> bs;
            while (in >> t) {
                auto v = numbers(t);
                bs.push_back({v[0], v[1], v[2]});
            }
            std::string sep;
            for (const auto& [x, h] : skyline(bs)) {
                std::cout << sep << x << ',' << h;
                sep = " ";
            }
            std::cout << '\n';
        }
    }
}
