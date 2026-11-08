// Test driver: reads "pow a b m", one per line, prints a^b mod m.
#include <iostream>
#include <sstream>
#include <string>

#include "mod_pow.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    long long a = 0, b = 0, m = 0;
    if (!(words >> op >> a >> b >> m) || op != "pow") continue;
    std::cout << mod_pow(a, b, m) << "\n";
  }
  return 0;
}
