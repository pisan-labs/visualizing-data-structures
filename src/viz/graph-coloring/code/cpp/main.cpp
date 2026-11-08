// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "coloring.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string name;
      names.clear();
      index.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      adj.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      int u = index.at(a), v = index.at(b);
      adj[u].push_back(v);
      adj[v].push_back(u);
    } else if (op == "color") {
      std::vector<int> color = greedyColor(adj);
      int k = 0;
      std::string row;
      for (int c : color) {
        k = std::max(k, c);
        row += " " + std::to_string(c);
      }
      std::cout << k << " |" << row << '\n';
    }
  }
  return 0;
}
