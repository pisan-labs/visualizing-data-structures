// Test driver: reads one operation per line, prints one result per line.
#include <array>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "johnson.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::array<int, 3>> arcs;
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
      arcs.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
    } else if (op == "edge") {
      std::string a, b;
      int w;
      words >> a >> b >> w;
      int u = index.at(a), v = index.at(b);
      arcs.push_back({u, v, w});
      if (!directed) arcs.push_back({v, u, w});
    } else if (op == "johnson") {
      auto dist = johnson(static_cast<int>(names.size()), arcs);
      if (!dist) {
        std::cout << "negative cycle\n";
        continue;
      }
      std::string out;
      for (std::size_t s = 0; s < dist->size(); s++) {
        if (s) out += " | ";
        for (std::size_t t = 0; t < (*dist)[s].size(); t++) {
          if (t) out += ' ';
          long long x = (*dist)[s][t];
          out += x == INF ? "INF" : std::to_string(x);
        }
      }
      std::cout << out << '\n';
    }
  }
  return 0;
}
