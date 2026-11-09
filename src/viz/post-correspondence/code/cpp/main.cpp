// Test driver: reads one operation per line, prints one result per line.
//   dominoes b/ca a/ab ...   loads an instance (prints nothing)
//   search <bound>           prints "match 2 1 3 2 4", "no match", "none up to 6" or "gave up"
//   try 2 1 3                prints "match", "dead at column 4" or "alive top +ca"
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "pcp.hpp"

int main() {
    std::vector<Domino> dominoes;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        in >> op;
        if (op == "dominoes") {
            dominoes.clear();
            std::string d;
            while (in >> d) {
                auto slash = d.find('/');
                dominoes.push_back({d.substr(0, slash), d.substr(slash + 1)});
            }
        } else if (op == "search") {
            std::size_t bound;
            in >> bound;
            std::cout << search(dominoes, bound) << '\n';
        } else if (op == "try") {
            std::vector<int> seq;
            int k;
            while (in >> k) seq.push_back(k);
            std::cout << trySequence(dominoes, seq) << '\n';
        }
    }
}
