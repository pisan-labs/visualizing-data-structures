// Test driver: "can T x1 x2 ..." prints true or false; "subset T x1 x2 ..." prints true and the
// numbers of a subset that adds up to T, or false.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "subset_sum.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int target = 0;
    if (!(words >> op >> target)) continue;
    std::vector<int> xs;
    int x;
    while (words >> x) xs.push_back(x);
    const auto found = subset_sum(xs, target);
    if (op == "can") std::cout << (found ? "true" : "false") << "\n";
    if (op == "subset") {
      std::cout << (found ? "true" : "false");
      if (found)
        for (int v : *found) std::cout << ' ' << v;
      std::cout << "\n";
    }
  }
  return 0;
}
