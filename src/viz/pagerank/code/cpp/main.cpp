// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "pagerank.hpp"

static std::string three(double x) {
  long long k = static_cast<long long>(std::floor(x * 1000 + 0.5));
  char buf[32];
  std::snprintf(buf, sizeof buf, "%lld.%03lld", k / 1000, k % 1000);
  return buf;
}

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::vector<int>> links;
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
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      links.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      int u = index.at(a), v = index.at(b);
      links[u].push_back(v);
      if (!directed) links[v].push_back(u);
    } else if (op == "pagerank") {
      double d;
      std::string mode;
      words >> d >> mode;
      Ranks r = pagerank(links, d, mode == "spread");
      std::cout << r.iterations << " |";
      for (double x : r.rank) std::cout << ' ' << three(x);
      std::cout << '\n';
    }
  }
  return 0;
}
