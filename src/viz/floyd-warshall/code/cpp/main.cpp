// Test driver: reads one operation per line, prints one result per line.
#include <array>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "floyd_warshall.hpp"

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
    } else if (op == "floyd") {
      int n = static_cast<int>(names.size());
      AllPairs r = floydWarshall(n, edges);
      std::string d, pi, negative;
      for (int i = 0; i < n; i++) {
        if (i > 0) {
          d += "; ";
          pi += "; ";
        }
        for (int j = 0; j < n; j++) {
          d += (j ? " " : "") + (r.d[i][j] == INF ? std::string("inf") : std::to_string(r.d[i][j]));
          pi += (j ? " " : "") + (r.pi[i][j] < 0 ? std::string("-") : names[r.pi[i][j]]);
        }
        if (r.d[i][i] < 0) negative += " " + names[i];
      }
      std::cout << d << " | " << pi;
      if (!negative.empty()) std::cout << " | negative cycle" << negative;
      std::cout << '\n';
    } else if (op == "path") {
      std::string a, b;
      words >> a >> b;
      int n = static_cast<int>(names.size());
      AllPairs r = floydWarshall(n, edges);
      int i = index.at(a), j = index.at(b);
      bool broken = false;
      for (int x = 0; x < n; x++)
        if (r.d[x][x] < 0 && r.d[i][x] != INF && r.d[x][j] != INF) broken = true;
      if (broken) {
        std::cout << "negative cycle\n";
      } else if (r.d[i][j] == INF) {
        std::cout << "no path\n";
      } else {
        std::string out;
        for (int v : path(r, i, j)) out += (out.empty() ? "" : " ") + names[v];
        std::cout << out << '\n';
      }
    }
  }
  return 0;
}
