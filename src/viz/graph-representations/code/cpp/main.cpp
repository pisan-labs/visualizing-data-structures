// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "representations.hpp"

static std::string namesOf(const std::vector<int>& vs, const std::vector<std::string>& names) {
  if (vs.empty()) return "none";
  std::string out;
  for (int v : vs) out += (out.empty() ? "" : " ") + names[v];
  return out;
}

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::unique_ptr<AdjacencyList> list;
  std::unique_ptr<AdjacencyMatrix> matrix;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "graph") {
      std::string kind, name;
      words >> kind;
      names.clear();
      index.clear();
      while (words >> name) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
      int n = static_cast<int>(names.size());
      list = std::make_unique<AdjacencyList>(n, kind == "directed");
      matrix = std::make_unique<AdjacencyMatrix>(n, kind == "directed");
      continue;
    }
    std::string a, b;
    words >> a >> b;
    int u = index.at(a);
    int v = b.empty() ? -1 : index.at(b);
    if (op == "edge") {
      list->addEdge(u, v);
      matrix->addEdge(u, v);
    } else if (op == "has") {
      std::cout << (list->hasEdge(u, v) ? "yes" : "no") << ' '
                << (matrix->hasEdge(u, v) ? "yes" : "no") << '\n';
    } else if (op == "add") {
      std::cout << (list->addEdge(u, v) ? "added" : "exists") << ' '
                << (matrix->addEdge(u, v) ? "added" : "exists") << '\n';
    } else if (op == "remove") {
      std::cout << (list->removeEdge(u, v) ? "removed" : "missing") << ' '
                << (matrix->removeEdge(u, v) ? "removed" : "missing") << '\n';
    } else if (op == "neighbours") {
      std::cout << namesOf(list->neighbours(u), names) << " / "
                << namesOf(matrix->neighbours(u), names) << '\n';
    }
  }
  return 0;
}
