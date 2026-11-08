// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "quadtree.hpp"

int main() {
  int capacity = 1;
  QuadTree tree(capacity);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> n;
    int v;
    while (words >> v) n.push_back(v);
    if (op == "capacity") {
      capacity = n[0];
      tree = QuadTree(capacity);
    } else if (op == "clear") {
      tree = QuadTree(capacity);
    } else if (op == "insert") {
      tree.insert({n[0], n[1]});
    } else if (op == "query") {
      std::vector<Point> pts = tree.query({n[0], n[1]}, {n[2], n[3]});
      std::sort(pts.begin(), pts.end());
      if (pts.empty()) std::cout << "none";
      for (std::size_t i = 0; i < pts.size(); i++)
        std::cout << (i ? " " : "") << pts[i].first << "," << pts[i].second;
      std::cout << "\n";
    } else if (op == "stats") {
      auto s = tree.stats();
      std::cout << "nodes=" << s.first << " height=" << s.second << "\n";
    }
  }
  return 0;
}
