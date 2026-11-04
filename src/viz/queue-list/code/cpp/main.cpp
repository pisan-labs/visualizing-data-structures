// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "linked_queue.hpp"

int main() {
  LinkedQueue<std::string> queue;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "enqueue") {
      queue.enqueue(arg);
      std::cout << "ok\n";
    } else if (op == "dequeue") {
      try {
        std::cout << queue.dequeue() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "underflow\n";
      }
    } else if (op == "peek") {
      try {
        std::cout << queue.peek() << "\n";
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
