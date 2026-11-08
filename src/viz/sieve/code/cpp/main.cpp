// Test driver: reads "sieve n", one per line, prints the primes up to n.
#include <iostream>
#include <sstream>
#include <string>

#include "sieve.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    if (!(words >> op >> n) || op != "sieve") continue;
    std::vector<int> primes = sieve(n);
    for (std::size_t i = 0; i < primes.size(); i++) {
      std::cout << (i ? " " : "") << primes[i];
    }
    std::cout << "\n";
  }
  return 0;
}
