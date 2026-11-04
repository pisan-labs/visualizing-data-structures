// Test driver: "load v1 v2 ..." replaces the array; "search x" prints the index of x or -1.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "linear_search.hpp"

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
      words >> x;
      std::cout << linear_search(a, x) << "\n";
    }
  }
  return 0;
}
