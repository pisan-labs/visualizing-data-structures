// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "min_max_heap.hpp"

int main() {
  std::unique_ptr<MinMaxHeap> heap;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "new") {
      heap = std::make_unique<MinMaxHeap>(args[0]);
    } else if (op == "insert") {
      try {
        heap->insert(args[0]);
        std::cout << heap->size() << "\n";
      } catch (const std::overflow_error&) {
        std::cout << "overflow\n";
      }
    } else if (op == "extractMin" || op == "extractMax") {
      try {
        std::cout << (op == "extractMin" ? heap->extract_min() : heap->extract_max()) << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "build") {
      heap->build(args);
      std::cout << heap->size() << "\n";
    } else if (op == "clear") {
      heap->clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
