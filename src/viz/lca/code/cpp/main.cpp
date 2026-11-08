// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "lca.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> adj;
  std::unique_ptr<BinaryLifting> table;
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
    } else if (op == "build") {
      std::string r;
      words >> r;
      table = std::make_unique<BinaryLifting>(adj, index.at(r));
    } else if (op == "lca") {
      std::string a, b;
      words >> a >> b;
      std::cout << names[table->lca(index.at(a), index.at(b))] << '\n';
    }
  }
  return 0;
}
