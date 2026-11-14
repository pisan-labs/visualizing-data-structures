// Test driver: "lock goal b1 b2 ..." prints the fewest turns from all zeros to goal, never
// showing a barred combination; "words goal w1 w2 ..." prints the fewest one-letter changes
// from w1 to goal through the list. Both print -1 when the goal cannot be reached.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "state_bfs.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd, goal;
        if (!(in >> cmd >> goal)) continue;
        std::vector<std::string> rest;
        for (std::string w; in >> w;) rest.push_back(w);
        if (cmd == "lock")
            std::cout << lockMoves(rest, goal) << "\n";
        else if (cmd == "words")
            std::cout << wordMoves(rest, goal) << "\n";
    }
}
