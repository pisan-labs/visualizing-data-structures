// Test driver: reads "fib n" or "memo n", one per line, and prints the value and the calls.
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>

#include "fibonacci.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    if (!(words >> op >> n)) continue;
    calls = 0;
    std::unordered_map<int, long long> memo;
    long long value = op == "fib" ? fib(n) : fib_memo(n, memo);
    std::cout << value << " " << calls << "\n";
  }
  return 0;
}
