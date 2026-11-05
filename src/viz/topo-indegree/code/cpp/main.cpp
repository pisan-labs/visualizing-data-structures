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
    } else if (op == "sort") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      std::vector<int> order = topologicalSort(adj);
      std::vector<bool> done(names.size(), false);
      std::string out;
      for (int u : order) {
        out += names[u] + " ";
        done[u] = true;
      }
      out += "|";
      std::string left;
      for (size_t v = 0; v < names.size(); v++)
        if (!done[v]) left += " " + names[v];
      std::cout << out << (left.empty() ? " -" : left) << '\n';
    }
  }
  return 0;
}
