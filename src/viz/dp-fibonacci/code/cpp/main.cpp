// Test driver: "fib n" prints F(n) bottom-up; "memo n" prints F(n) top-down with a memo.
#include <iostream>
#include <sstream>
#include <string>

#include "fibonacci.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int n = 0;
    if (!(words >> op >> n)) continue;
    if (op == "fib") std::cout << fib(n) << "\n";
    if (op == "memo") std::cout << fib_memo(n) << "\n";
  }
  return 0;
}
