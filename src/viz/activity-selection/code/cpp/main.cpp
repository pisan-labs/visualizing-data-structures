// Test driver: "select s1-f1 s2-f2 ..." prints how many activities earliest finish first
// chooses, then their numbers in the order chosen.
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "activities.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, pair;
    if (!(words >> op) || op != "select") continue;
    std::vector<std::pair<int, int>> acts;
    while (words >> pair) {
      const auto dash = pair.find('-');
      acts.emplace_back(std::stoi(pair.substr(0, dash)), std::stoi(pair.substr(dash + 1)));
    }
    const auto chosen = select_activities(acts);
    std::cout << chosen.size();
    for (int k : chosen) std::cout << ' ' << k;
    std::cout << "\n";
  }
  return 0;
}
