// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "hungarian.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, goal;
    int n = 0;
    if (!(words >> op) || op != "solve") continue;
    words >> goal >> n;
    std::vector<std::vector<int>> cost(n, std::vector<int>(n));
    for (auto& row : cost)
      for (int& c : row) words >> c;
    const std::vector<int> mate = best_assignment(cost, goal == "max");
    int total = 0;
    std::string cols;
    for (int i = 0; i < n; i++) {
      total += cost[i][mate[i]];
      cols += (i ? " " : "") + std::to_string(mate[i] + 1);
    }
    std::cout << total << " | " << cols << "\n";
  }
  return 0;
}
