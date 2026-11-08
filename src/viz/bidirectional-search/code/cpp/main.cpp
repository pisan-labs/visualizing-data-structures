// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "bidirectional.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj, radj;
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
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      adj.assign(names.size(), {});
      radj.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      int u = index.at(a), v = index.at(b);
      adj[u].push_back(v);
      radj[v].push_back(u);
      if (!directed) {
        adj[v].push_back(u);
        radj[u].push_back(v);
      }
    } else if (op == "search") {
      std::string a, b;
      words >> a >> b;
      for (auto& row : adj) std::sort(row.begin(), row.end());
      for (auto& row : radj) std::sort(row.begin(), row.end());
      Search r = bidirectionalBfs(adj, radj, index.at(a), index.at(b));
      if (r.path.empty()) {
        std::cout << "none | " << r.expanded << '\n';
      } else {
        std::cout << r.path.size() - 1 << " |";
        for (int v : r.path) std::cout << ' ' << names[v];
        std::cout << " | " << r.expanded << '\n';
      }
    }
  }
  return 0;
}
