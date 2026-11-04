// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "linked_stack.hpp"

int main() {
  LinkedStack<std::string> stack;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "push") {
      stack.push(arg);
      std::cout << "ok\n";
    } else if (op == "pop") {
      try {
        std::cout << stack.pop() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "underflow\n";
      }
    } else if (op == "peek") {
      try {
        std::cout << stack.peek() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else {
      std::cerr << "unknown operation " << op << "\n";
      return 1;
    }
  }
  return 0;
}
