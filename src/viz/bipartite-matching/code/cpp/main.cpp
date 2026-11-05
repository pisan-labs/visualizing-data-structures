// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "matching.hpp"

int main() {
  std::vector<std::string> left, right;
  std::map<std::string, int> li, ri;
  std::vector<std::vector<int>> adj;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, name;
    if (!(words >> op)) continue;
    if (op == "left") {
      left.clear();
      li.clear();
      while (words >> name) {
        li[name] = static_cast<int>(left.size());
        left.push_back(name);
      }
      adj.assign(left.size(), {});
    } else if (op == "right") {
      right.clear();
      ri.clear();
      while (words >> name) {
        ri[name] = static_cast<int>(right.size());
        right.push_back(name);
      }
    } else if (op == "edge") {
      std::string u, v;
      words >> u >> v;
      adj[li.at(u)].push_back(ri.at(v));
    } else if (op == "match") {
      for (auto& a : adj) std::sort(a.begin(), a.end());
      Matching m(adj, static_cast<int>(right.size()));
      std::vector<std::string> mate(left.size());
      for (size_t v = 0; v < right.size(); v++)
        if (m.matchR[v] >= 0) mate[m.matchR[v]] = right[v];
      std::string out = std::to_string(m.size) + " |";
      for (size_t u = 0; u < left.size(); u++)
        if (!mate[u].empty()) out += " " + left[u] + "-" + mate[u];
      std::cout << out << '\n';
    }
  }
  return 0;
}
