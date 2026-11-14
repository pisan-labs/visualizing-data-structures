// Test driver: "load w1 w2 ..." replaces the words; "group" prints the groups, each as its
// words joined by commas, groups separated by spaces; "unique w" prints firstUnique(w).
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "frequency.hpp"

int main() {
    std::vector<std::string> words;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "load") {
            words.clear();
            for (std::string w; in >> w;) words.push_back(w);
        } else if (cmd == "group") {
            const auto groups = groupAnagrams(words);
            for (std::size_t g = 0; g < groups.size(); ++g) {
                for (std::size_t i = 0; i < groups[g].size(); ++i)
                    std::cout << (i ? "," : (g ? " " : "")) << groups[g][i];
            }
            std::cout << "\n";
        } else if (cmd == "unique") {
            std::string w;
            in >> w;
            std::cout << firstUnique(w) << "\n";
        }
    }
}
