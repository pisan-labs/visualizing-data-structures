// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "array_stack.hpp"

int main() {
  std::unique_ptr<ArrayStack<std::string>> stack;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "new") {
      stack = std::make_unique<ArrayStack<std::string>>(std::stoi(arg));
    } else if (op == "push") {
      try {
        stack->push(arg);
        std::cout << "ok\n";
      } catch (const std::overflow_error&) {
        std::cout << "overflow\n";
      }
    } else if (op == "pop") {
      try {
        std::cout << stack->pop() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "underflow\n";
      }
    } else if (op == "peek") {
      try {
        std::cout << stack->peek() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "clear") {
      stack->clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
