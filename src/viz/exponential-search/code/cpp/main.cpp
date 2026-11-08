// Test driver: "load v1 v2 ..." replaces the sorted vector; "search x" prints the index found.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "exponential_search.hpp"

int main() {
  std::vector<int> a;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "load") {
      a.clear();
      int v;
      while (words >> v) a.push_back(v);
    } else if (op == "search") {
      int x = 0;
      if (words >> x) std::cout << exponential_search(a, x) << "\n";
    }
  }
  return 0;
}
