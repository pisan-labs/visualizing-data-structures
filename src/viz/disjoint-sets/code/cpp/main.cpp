// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "disjoint_sets.hpp"

int main() {
  DisjointSets ds;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int x = 0, y = 0;
    if (op == "clear") {
      ds = DisjointSets();
    } else if (op == "makeset") {
      words >> x;
      ds.makeSet(x);
    } else if (op == "find") {
      words >> x;
      std::cout << ds.find(x) << '\n';
    } else if (op == "union") {
      words >> x >> y;
      int root = ds.unite(x, y);
      if (root < 0)
        std::cout << "same\n";
      else
        std::cout << root << '\n';
    } else if (op == "parents") {
      std::string out;
      for (const auto& [k, p] : ds.parent)
        out += (out.empty() ? "" : " ") + std::to_string(k) + ":" + std::to_string(p);
      std::cout << out << '\n';
    }
  }
  return 0;
}
