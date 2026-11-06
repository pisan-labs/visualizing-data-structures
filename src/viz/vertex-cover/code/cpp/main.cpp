// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "vertex_cover.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  Edges edges;
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
      words >> a >> b;
      edges.push_back({index.at(a), index.at(b)});
    } else if (op == "cover") {
      int n = static_cast<int>(names.size());
      std::string shown;
      for (int v : approxVertexCover(n, edges)) shown += (shown.empty() ? "" : " ") + names[v];
      std::cout << (shown.empty() ? "-" : shown) << " | " << minCoverSize(n, edges) << '\n';
    }
  }
  return 0;
}
