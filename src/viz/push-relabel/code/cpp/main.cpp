// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <array>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "push_relabel.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::array<int, 3>> arcs;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string name;
      names.clear();
      index.clear();
      arcs.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
    } else if (op == "arc") {
      std::string a, b;
      int c;
      words >> a >> b >> c;
      arcs.push_back({index.at(a), index.at(b), c});
    } else if (op == "push-relabel") {
      std::string s, t;
      words >> s >> t;
      int n = static_cast<int>(names.size());
      std::vector<std::vector<int>> cap(n, std::vector<int>(n, 0));
      for (const auto& a : arcs) cap[a[0]][a[1]] = a[2];
      PushRelabel r(cap, index.at(s), index.at(t));
      std::string side, flows;
      for (int v : r.side) side += (side.empty() ? "" : " ") + names[v];
      for (const auto& a : arcs)
        flows += (flows.empty() ? "" : " ") + names[a[0]] + ">" + names[a[1]] + ":" +
                 std::to_string(std::max(0, r.flow[a[0]][a[1]]));
      std::cout << r.value << " | " << r.pushes << " | " << r.relabels << " | " << side << " | "
                << flows << '\n';
    }
  }
  return 0;
}
