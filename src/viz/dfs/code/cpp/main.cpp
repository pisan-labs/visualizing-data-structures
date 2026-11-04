// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "dfs.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
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
      directed = kind == "directed";
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
      if (!directed) adj[v].push_back(u);
    } else if (op == "dfs") {
      std::string s;
      words >> s;
      for (auto& a : adj) std::sort(a.begin(), a.end());
      Dfs r(adj, index.at(s), directed);
      std::string out;
      for (int x : r.d) out += (out.empty() ? "" : " ") + std::to_string(x);
      out += " |";
      for (int x : r.f) out += " " + std::to_string(x);
      out += " |";
      for (int x : r.pi) out += " " + (x < 0 ? std::string("-") : names[x]);
      out += " |";
      for (auto [u, v] : edges) {
        auto it = r.kind.find({u, v});
        if (it == r.kind.end()) it = r.kind.find({v, u});
        out += " " + names[u] + "-" + names[v] + ":" + it->second;
      }
      std::cout << out << '\n';
    }
  }
  return 0;
}
