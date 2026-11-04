// Test driver: "load v1 v2 ..." replaces the array; "sort" sorts it and prints it.
#include <cstddef>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "insertion_sort.hpp"

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
    } else if (op == "sort") {
      insertion_sort(a);
      for (std::size_t i = 0; i < a.size(); i++) std::cout << (i ? " " : "") << a[i];
      std::cout << "\n";
    }
  }
  return 0;
}
