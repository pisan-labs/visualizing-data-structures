// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "fibonacci_heap.hpp"

int main() {
  FibonacciHeap heap;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "insert") {
      heap.insert(args[0]);
      std::cout << heap.size() << "\n";
    } else if (op == "findmin" || op == "deletemin") {
      try {
        std::cout << (op == "findmin" ? heap.minimum() : heap.extract_min()) << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "union") {
      FibonacciHeap other;
      for (int key : args) other.insert(key);
      heap.merge_with(other);
      std::cout << heap.size() << "\n";
    } else if (op == "decrease" || op == "delete") {
      FibonacciHeap::Node* node = heap.find(args[0]);
      if (!node) {
        std::cout << "missing\n";
      } else if (op == "delete") {
        heap.remove(node);
        std::cout << "ok\n";
      } else {
        try {
          heap.decrease_key(node, args[1]);
          std::cout << "ok\n";
        } catch (const std::invalid_argument&) {
          std::cout << "bigger\n";
        }
      }
    } else if (op == "clear") {
      heap.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
