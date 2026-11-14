// Test driver: reads one operation per line, prints one line per result.
#include <iostream>
#include <sstream>
#include <string>

#include "two_stack_queue.hpp"

int main() {
  TwoStackQueue queue;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "enqueue") {
      int x;
      words >> x;
      queue.enqueue(x);
    } else if (queue.size() == 0) {
      std::cout << "empty\n";
    } else if (op == "dequeue") {
      std::cout << queue.dequeue() << "\n";
    } else if (op == "peek") {
      std::cout << queue.peek() << "\n";
    }
  }
  return 0;
}
