// Test driver: reads one operation per line, prints one result per line.
// "node <parent> <word> <reward>" adds a node (parent -1 for the root, reward
// - for a word that is not the last); "reset" empties the search. "iterate <c>
// <u...>" runs one iteration with these random numbers and prints the path,
// the leaf and its reward, then n and W of each child of the root. "move"
// prints the most visited child.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "mcts.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000, k % 1000);
    return buf;
}

int main() {
    std::vector<Node> t;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "node") {
            int parent;
            std::string word, reward;
            in >> parent >> word >> reward;
            t.push_back({word, parent, reward == "-" ? 0 : std::stod(reward), {}});
            if (parent >= 0) t[parent].children.push_back(static_cast<int>(t.size()) - 1);
        } else if (op == "reset") {
            for (Node& v : t) {
                v.n = 0;
                v.w = 0;
                v.tried = 0;
            }
        } else if (op == "iterate") {
            double c, u;
            in >> c;
            std::vector<double> us;
            while (in >> u) us.push_back(u);
            std::size_t next = 0;
            std::vector<int> path = iterate(t, c, [&] { return us[next++]; });
            int leaf = path.back();
            path.pop_back();
            std::string words;
            for (std::size_t k = 1; k < path.size(); k++) words += (k > 1 ? " " : "") + t[path[k]].word;
            std::cout << words << " > " << t[leaf].word << ' ' << three(t[leaf].reward) << " |";
            for (int ch : t[0].children) std::cout << ' ' << t[ch].n << ' ' << three(t[ch].w);
            std::cout << '\n';
        } else if (op == "move") {
            std::cout << "move " << t[bestMove(t)].word << '\n';
        }
    }
}
