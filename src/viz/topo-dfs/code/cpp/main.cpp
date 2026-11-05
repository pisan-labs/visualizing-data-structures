// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "topo.hpp"

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
    } else if (op == "topo") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      TopoSort t(adj);
      if (t.hasCycle) {
        std::cout << "cycle " << names[t.cycleU] << ' ' << names[t.cycleV] << '\n';
        continue;
      }
      std::string out;
      for (int u : t.order) out += (out.empty() ? "" : " ") + names[u];
      std::cout << out << '\n';
    }
  }
  return 0;
}
