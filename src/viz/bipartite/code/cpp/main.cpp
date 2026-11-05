// Test driver: reads one operation per line, prints one result per line.
// Sides ignore direction, so every edge goes in both lists.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "bipartite.hpp"

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
      std::string kind, name;
      words >> kind;
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
      adj[index.at(a)].push_back(index.at(b));
      adj[index.at(b)].push_back(index.at(a));
    } else if (op == "check") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      BipartiteResult r = bipartite(adj);
      std::string out = r.ok ? "yes |" : "no |";
      if (r.ok) {
        for (int x : r.side) out += " " + std::to_string(x);
      } else {
        for (int x : r.cycle) out += " " + names[x];
      }
      std::cout << out << '\n';
    }
  }
  return 0;
}
