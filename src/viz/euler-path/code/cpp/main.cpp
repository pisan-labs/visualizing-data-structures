// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "euler.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::pair<int, int>> edges;
  bool directed = false;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string kind, name;
      words >> kind;
      directed = kind == "d";
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
    } else if (op == "euler") {
      auto path = eulerPath(static_cast<int>(names.size()), edges, directed);
      if (!path) {
        std::cout << "none\n";
        continue;
      }
      std::string out;
      for (int v : *path) out += (out.empty() ? "" : " ") + names[v];
      std::cout << out << '\n';
    }
  }
  return 0;
}
