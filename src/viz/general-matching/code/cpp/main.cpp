// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "blossom.hpp"

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
      names.clear();
      index.clear();
      for (std::string name; words >> name;) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      adj.assign(names.size(), {});
    } else if (op == "edge") {
      std::string a, b;
      words >> a >> b;
      adj[index[a]].push_back(index[b]);
      adj[index[b]].push_back(index[a]);
    } else if (op == "match") {
      for (auto& list : adj) std::sort(list.begin(), list.end());
      const std::vector<int> mate = Blossom::max_matching(adj);
      std::string pairs;
      int size = 0;
      for (int v = 0; v < static_cast<int>(mate.size()); v++) {
        if (mate[v] > v) {
          pairs += (size ? " " : "") + names[v] + "-" + names[mate[v]];
          size++;
        }
      }
      std::cout << size << " | " << pairs << "\n";
    }
  }
  return 0;
}
