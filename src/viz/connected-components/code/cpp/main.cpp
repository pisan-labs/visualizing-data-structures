// Test driver: reads one operation per line, prints one result per line.
// Components ignore direction, so every edge goes in both lists.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "components.hpp"

int main() {
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string kind, name;
      words >> kind;
      index.clear();
      while (words >> name) {
        int i = static_cast<int>(index.size());
        index[name] = i;
      }
      adj.assign(index.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      adj[index.at(a)].push_back(index.at(b));
      adj[index.at(b)].push_back(index.at(a));
    } else if (op == "components") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      Components r = connectedComponents(adj);
      std::string out = std::to_string(r.count) + " |";
      for (int c : r.cc) out += " " + std::to_string(c);
      std::cout << out << '\n';
    }
  }
  return 0;
}
