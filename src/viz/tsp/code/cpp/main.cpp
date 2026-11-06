// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "tsp.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  Matrix d;
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
      d.assign(names.size(), std::vector<int>(names.size(), 0));
    } else if (op == "edge") {
      std::string a, b;
      int w;
      words >> a >> b >> w;
      d[index.at(a)][index.at(b)] = d[index.at(b)][index.at(a)] = w;
    } else if (op == "tsp") {
      std::vector<int> tour = approxTour(d);
      std::string out;
      for (int c : tour) out += names[c] + " ";
      std::cout << out << "| " << tourLength(d, tour) << " | " << heldKarp(d) << '\n';
    }
  }
  return 0;
}
