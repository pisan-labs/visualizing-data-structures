// Test driver: reads "gcd a b", "ext a b" or "inverse a m", one per line, prints each result.
#include <iostream>
#include <sstream>
#include <string>

#include "euclid.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    long long a = 0, b = 0;
    if (!(words >> op >> a >> b)) continue;
    if (op == "gcd") {
      std::cout << euclid(a, b) << "\n";
    } else if (op == "ext") {
      auto [d, x, y] = extended_euclid(a, b);
      std::cout << d << " " << x << " " << y << "\n";
    } else if (op == "inverse") {
      auto inv = mod_inverse(a, b);
      if (inv) {
        std::cout << *inv << "\n";
      } else {
        std::cout << "none\n";
      }
    }
  }
  return 0;
}
