// Test driver: "first n" prints the columns of the first solution (from 1), "count n" prints
// how many solutions there are. One line in, one line out.
#include <iostream>
#include <sstream>
#include <string>

#include "queens.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    if (!(words >> op >> n)) continue;
    if (op == "first") {
      auto found = solve_queens(n);
      if (found.empty()) {
        std::cout << "none\n";
        continue;
      }
      for (std::size_t r = 0; r < found[0].size(); r++) {
        std::cout << (r ? " " : "") << found[0][r] + 1;
      }
      std::cout << "\n";
    } else if (op == "count") {
      std::cout << solve_queens(n, false).size() << "\n";
    }
  }
  return 0;
}
