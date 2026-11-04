// Test driver: "coins c1 c2 ..." sets the coins. "change a" prints the number of coins and the
// coins themselves ("none" if a cannot be made); "ways a" prints the number of ways to make a.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "change.hpp"

int main() {
  std::vector<int> coins;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "coins") {
      coins.clear();
      int c = 0;
      while (words >> c) coins.push_back(c);
    } else if (op == "change") {
      int amount = 0;
      words >> amount;
      const auto paid = fewest_coins(coins, amount);
      if (!paid) {
        std::cout << "none\n";
        continue;
      }
      std::cout << paid->size();
      for (int c : *paid) std::cout << ' ' << c;
      std::cout << "\n";
    } else if (op == "ways") {
      int amount = 0;
      words >> amount;
      std::cout << count_ways(coins, amount) << "\n";
    }
  }
  return 0;
}
