// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "pairing_heap.hpp"

const int CAPACITY = 31;  // the page draws at most this many keys

int main() {
  PairingHeap heap;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "insert") {
      if (heap.size() >= CAPACITY) {
        std::cout << "full\n";
      } else {
        heap.insert(args[0]);
        std::cout << heap.size() << "\n";
      }
    } else if (op == "deleteMin") {
      try {
        std::cout << heap.delete_min() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "decrease") {
      PairingHeap::Node* node = heap.find(args[0]);
      if (!node) {
        std::cout << "missing\n";
      } else {
        try {
          heap.decrease_key(node, args[1]);
          std::cout << "ok\n";
        } catch (const std::invalid_argument&) {
          std::cout << "larger\n";
        }
      }
    } else if (op == "meld") {
      if (heap.size() + static_cast<int>(args.size()) > CAPACITY) {
        std::cout << "full\n";
      } else {
        PairingHeap other;
        for (int k : args) other.insert(k);
        heap.meld_with(other);
        std::cout << heap.size() << "\n";
      }
    } else if (op == "clear") {
      heap.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
