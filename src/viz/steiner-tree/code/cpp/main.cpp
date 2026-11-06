// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "steiner.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  Matrix w;
  std::vector<int> terminals;
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
      w.assign(names.size(), std::vector<int>(names.size(), 0));
    } else if (op == "edge") {
      std::string a, b;
      int x;
      words >> a >> b >> x;
      w[index.at(a)][index.at(b)] = w[index.at(b)][index.at(a)] = x;
    } else if (op == "terminals") {
      std::string name;
      terminals.clear();
      while (words >> name) terminals.push_back(index.at(name));
      std::sort(terminals.begin(), terminals.end());
    } else if (op == "steiner") {
      long long weight = 0;
      std::string shown;
      for (auto [u, v] : approxSteiner(w, terminals)) {
        weight += w[u][v];
        shown += (shown.empty() ? "" : " ") + names[u] + "-" + names[v];
      }
      std::cout << weight << " | " << (shown.empty() ? "-" : shown) << " | "
                << exactSteinerWeight(w, terminals) << '\n';
    }
  }
  return 0;
}
