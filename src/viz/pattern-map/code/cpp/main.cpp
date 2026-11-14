// Test driver: "follow <cue>" prints the pattern the cue points to ("none" if the words
// are not a cue); "family <name>" prints the family's patterns, separated by spaces.
#include <iostream>
#include <string>

#include "pattern_map.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        auto space = line.find(' ');
        std::string cmd = line.substr(0, space);
        std::string arg = space == std::string::npos ? "" : line.substr(space + 1);
        if (cmd == "follow") {
            std::string p = follow(arg);
            std::cout << (p.empty() ? "none" : p) << "\n";
        } else if (cmd == "family") {
            std::string out;
            for (const auto& p : family(arg)) out += (out.empty() ? "" : " ") + p;
            std::cout << (out.empty() ? "none" : out) << "\n";
        }
    }
}
