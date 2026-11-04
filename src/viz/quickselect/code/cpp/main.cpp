// Test driver: "load v1 v2 ..." replaces the array; "select k" prints the k-th smallest value.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "quickselect.hpp"

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
    } else if (op == "select") {
      int k = 0;
      words >> k;
      std::cout << quickselect(a, k) << "\n";
    }
  }
  return 0;
}
