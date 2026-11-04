// Test driver: reads "fib n" or "binom n k", one per line, and prints the value, the calls
// without a memo and the calls with one.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>

#include "recursion.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    int k = 0;
    if (!(words >> op >> n)) continue;
    long long value = 0;
    long long plain = 0;
    calls = 0;
    if (op == "fib") {
      value = fib(n);
      plain = calls;
      calls = 0;
      std::map<int, long long> memo;
      fib(n, memo);
    } else {
      words >> k;
      value = binomial(n, k);
      plain = calls;
      calls = 0;
      std::map<std::pair<int, int>, long long> memo;
      binomial(n, k, memo);
    }
    std::cout << value << " " << plain << " " << calls << "\n";
  }
  return 0;
}
