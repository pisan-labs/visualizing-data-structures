// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <array>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "bellman_ford.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::array<int, 3>> edges;
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
    } else if (op == "edge") {
      std::string a, b;
      int w;
      words >> a >> b >> w;
      edges.push_back({index.at(a), index.at(b), w});
      if (!directed) edges.push_back({index.at(b), index.at(a), w});
    } else if (op == "bellman-ford") {
      std::string s;
      words >> s;
      std::sort(edges.begin(), edges.end());
      Paths r = bellmanFord(static_cast<int>(names.size()), edges, index.at(s));
      std::string out;
      for (long long x : r.d) out += (out.empty() ? "" : " ") + (x == INF ? "inf" : std::to_string(x));
      out += " |";
      for (int x : r.pi) out += " " + (x < 0 ? std::string("-") : names[x]);
      if (!r.cycle.empty()) {
        auto k = std::min_element(r.cycle.begin(), r.cycle.end()) - r.cycle.begin();
        out += " | negative cycle";
        for (size_t i = 0; i < r.cycle.size(); i++) out += " " + names[r.cycle[(k + i) % r.cycle.size()]];
      }
      std::cout << out << '\n';
    }
  }
  return 0;
}
