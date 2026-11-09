// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "karger.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::pair<int, int>> edges;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string name;
      names.clear();
      index.clear();
      edges.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      edges.emplace_back(index.at(a), index.at(b));
    } else if (op == "karger") {
      std::vector<int> draws;
      int d;
      while (words >> d) draws.push_back(d);
      size_t next = 0;
      Karger k(static_cast<int>(names.size()), edges, [&](int lo, int hi) {
        int x = draws.at(next++);
        if (x < lo || x > hi) throw std::runtime_error("draw out of range");
        return x;
      });
      std::string side, rest;
      for (size_t v = 0; v < names.size(); v++) {
        std::string& to = k.group[v] == k.group[0] ? side : rest;
        to += (to.empty() ? "" : " ") + names[v];
      }
      std::string out = std::to_string(k.cut.size()) + " | " + side + " | " + rest;
      while (!out.empty() && out.back() == ' ') out.pop_back();
      std::cout << out << '\n';
    }
  }
  return 0;
}
