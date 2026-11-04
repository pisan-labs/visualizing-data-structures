// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "circular_queue.hpp"

int main() {
  std::unique_ptr<CircularQueue<std::string>> queue;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "new") {
      queue = std::make_unique<CircularQueue<std::string>>(std::stoi(arg));
    } else if (op == "enqueue") {
      try {
        queue->enqueue(arg);
        std::cout << "ok\n";
      } catch (const std::overflow_error&) {
        std::cout << "overflow\n";
      }
    } else if (op == "dequeue") {
      try {
        std::cout << queue->dequeue() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "underflow\n";
      }
    } else if (op == "peek") {
      try {
        std::cout << queue->peek() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "clear") {
      queue->clear();
      std::cout << "ok\n";
    } else {
      std::cerr << "unknown operation " << op << "\n";
      return 1;
    }
  }
  return 0;
}
