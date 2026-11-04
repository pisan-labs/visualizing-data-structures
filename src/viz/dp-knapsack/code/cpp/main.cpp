// Test driver: "value W w1:v1 w2:v2 ..." prints the best value for capacity W; "pack W w1:v1 ..."
// prints the best value and the numbers of the items taken.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "knapsack.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int capacity = 0;
    if (!(words >> op >> capacity)) continue;
    std::vector<Item> items;
    std::string pair;
    while (words >> pair) {
      const auto colon = pair.find(':');
      items.emplace_back(std::stoi(pair.substr(0, colon)), std::stoi(pair.substr(colon + 1)));
    }
    const int best = knapsack_table(items, capacity)[items.size()][capacity];
    if (op == "value") std::cout << best << "\n";
    if (op == "pack") {
      std::cout << best;
      for (int i : knapsack_items(items, capacity)) std::cout << ' ' << i;
      std::cout << "\n";
    }
  }
  return 0;
}
