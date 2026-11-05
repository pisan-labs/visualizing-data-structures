// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "bridges.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
  std::vector<std::pair<int, int>> edges;
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
      edges.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      adj.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      int u = index.at(a), v = index.at(b);
      edges.emplace_back(u, v);
      adj[u].push_back(v);
      adj[v].push_back(u);
    } else if (op == "cuts") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      Bridges b(adj);
      std::set<std::pair<int, int>> found;
      for (auto [u, v] : b.bridges) found.insert({std::min(u, v), std::max(u, v)});
      std::string cuts, bridges;
      for (int c : b.cuts) cuts += (cuts.empty() ? "" : " ") + names[c];
      for (auto [u, v] : edges)
        if (found.count({std::min(u, v), std::max(u, v)}))
          bridges += (bridges.empty() ? "" : " ") + names[u] + "-" + names[v];
      std::cout << (cuts.empty() ? "-" : cuts) << " | " << (bridges.empty() ? "-" : bridges)
                << '\n';
    }
  }
  return 0;
}
