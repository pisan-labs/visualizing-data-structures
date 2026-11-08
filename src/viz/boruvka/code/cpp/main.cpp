// Test driver: reads one operation per line, prints one result per line.
#include <array>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "boruvka.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::array<int, 3>> edges;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string name;
      names.clear();
      index.clear();
      edges.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
    } else if (op == "edge") {
      std::string a, b;
      int w;
      words >> a >> b >> w;
      edges.push_back({index.at(a), index.at(b), w});
    } else if (op == "boruvka") {
      Forest f = boruvka(static_cast<int>(names.size()), edges);
      std::string out = std::to_string(f.total) + " |";
      for (int i : f.tree) out += " " + names[edges[i][0]] + "-" + names[edges[i][1]];
      std::cout << out << '\n';
    }
  }
  return 0;
}
