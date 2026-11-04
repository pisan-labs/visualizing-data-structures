// Test driver: "load v1 v2 ..." replaces the sorted vector. "search x", "first x", "lower x",
// "upper x" and "locate x" print what that function returns.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "binary_search.hpp"

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
      continue;
    }
    int x = 0;
    if (!(words >> x)) continue;
    if (op == "search") {
      std::cout << search(a, x) << "\n";
    } else if (op == "first") {
      std::cout << first(a, x) << "\n";
    } else if (op == "lower") {
      std::cout << lower_bound_index(a, x) << "\n";
    } else if (op == "upper") {
      std::cout << upper_bound_index(a, x) << "\n";
    } else if (op == "locate") {
      std::cout << locate(a, x) << "\n";
    }
  }
  return 0;
}
