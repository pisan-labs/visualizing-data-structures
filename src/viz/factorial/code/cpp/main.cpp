// Test driver: reads one call per line ("factorial 5" or "tail 5"), prints each result.
#include <iostream>
#include <sstream>
#include <string>

#include "factorial.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    if (!(words >> op >> n)) continue;
    if (op == "factorial") {
      std::cout << factorial(n) << "\n";
    } else if (op == "tail") {
      std::cout << factorial_tail(n) << "\n";
    }
  }
  return 0;
}
