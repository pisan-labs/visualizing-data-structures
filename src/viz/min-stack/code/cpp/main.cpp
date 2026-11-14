// Test driver: reads one operation per line, prints one line per result.
#include <iostream>
#include <sstream>
#include <string>

#include "min_stack.hpp"

int main() {
  MinStack stack;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "push") {
      int x;
      words >> x;
      stack.push(x);
    } else if (stack.empty()) {
      std::cout << "empty\n";
    } else if (op == "pop") {
      std::cout << stack.pop() << "\n";
    } else if (op == "top") {
      std::cout << stack.top() << "\n";
    } else if (op == "min") {
      std::cout << stack.get_min() << "\n";
    }
  }
  return 0;
}
