// Test driver: "best W w1:v1 w2:v2 ..." prints the most value that fits in capacity W when items
// can be cut, as a whole number or a fraction in lowest terms, such as 68/3.
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "fractional.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, pair;
    int capacity = 0;
    if (!(words >> op >> capacity) || op != "best") continue;
    std::vector<std::pair<int, int>> items;
    while (words >> pair) {
      const auto colon = pair.find(':');
      items.emplace_back(std::stoi(pair.substr(0, colon)), std::stoi(pair.substr(colon + 1)));
    }
    const auto [num, den] = fractional_knapsack(items, capacity);
    if (den == 1)
      std::cout << num << "\n";
    else
      std::cout << num << '/' << den << "\n";
  }
  return 0;
}
