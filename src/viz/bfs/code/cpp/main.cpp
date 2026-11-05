// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "bfs.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
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
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      adj.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      adj[index.at(a)].push_back(index.at(b));
      if (!directed) adj[index.at(b)].push_back(index.at(a));
    } else if (op == "bfs") {
      std::string s;
      words >> s;
      for (auto& a : adj) std::sort(a.begin(), a.end());
      BfsResult r = bfs(adj, index.at(s));
      std::string out;
      for (int u : r.order) out += (out.empty() ? "" : " ") + names[u];
      out += " |";
      for (int x : r.d) out += " " + (x < 0 ? std::string("inf") : std::to_string(x));
      out += " |";
      for (int x : r.pi) out += " " + (x < 0 ? std::string("-") : names[x]);
      std::cout << out << '\n';
    }
  }
  return 0;
}
