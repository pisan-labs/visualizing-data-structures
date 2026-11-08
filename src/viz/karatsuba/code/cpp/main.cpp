// Test driver: reads "multiply x y", one per line, prints the product and the number of calls.
#include <iostream>
#include <sstream>
#include <string>

#include "karatsuba.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    long long x = 0, y = 0;
    if (!(words >> op >> x >> y) || op != "multiply") continue;
    karatsuba_calls = 0;
    long long product = karatsuba(x, y);
    std::cout << product << " " << karatsuba_calls << "\n";
  }
  return 0;
}
