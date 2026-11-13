// Test driver: reads one operation per line, prints one result per line.
// "m M" starts an empty graph. "insert x y level" inserts a point at a given level and prints
// the distances computed, a bar, and its links on each layer from the top down ("-" for none).
// "search x y k ef" prints the ids found and the distances computed.
#include <iostream>
#include <sstream>
#include <string>

#include "hnsw.hpp"

static std::string ids(const std::vector<int>& xs) {
    if (xs.empty()) return "-";
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + std::to_string(xs[i]);
    return out;
}

int main() {
    Hnsw g;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "m") {
            int m;
            in >> m;
            g = Hnsw(m);
        } else if (op == "insert") {
            Pt q;
            int level;
            in >> q.x >> q.y >> level;
            int id = g.insert(q, level);
            std::cout << g.distances << " |";
            for (int l = level; l >= 0; l--) std::cout << (l == level ? " " : " / ") << ids(g.links[id][l]);
            std::cout << "\n";
        } else if (op == "search") {
            Pt q;
            int k, ef;
            in >> q.x >> q.y >> k >> ef;
            std::vector<int> found = g.search(q, k, ef);
            std::cout << ids(found) << " | " << g.distances << "\n";
        }
    }
    return 0;
}
