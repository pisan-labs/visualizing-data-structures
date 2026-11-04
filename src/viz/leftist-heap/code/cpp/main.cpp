// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "leftist_heap.hpp"

int main() {
  LeftistHeap heap;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "insert") {
      int key;
      words >> key;
      heap.insert(key);
      std::cout << heap.size() << "\n";
    } else if (op == "deletemin") {
      try {
        std::cout << heap.delete_min() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "merge") {
      LeftistHeap other;
      int key;
      while (words >> key) other.insert(key);
      heap.merge_with(other);
      std::cout << heap.size() << "\n";
    } else if (op == "clear") {
      heap.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
