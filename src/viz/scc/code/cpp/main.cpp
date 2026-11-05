// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "scc.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
  bool directed = true;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string kind, name;
      words >> kind;
      directed = kind == "directed";
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
      if (!directed) adj[v].push_back(u);
    } else if (op == "scc") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      std::string out;
      for (const auto& c : Kosaraju::components(adj)) {
        if (!out.empty()) out += " |";
        for (int v : c) out += (out.empty() ? "" : " ") + names[v];
      }
      std::cout << out << '\n';
    }
  }
  return 0;
}
