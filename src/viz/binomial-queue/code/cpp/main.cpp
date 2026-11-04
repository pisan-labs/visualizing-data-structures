// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "binomial_queue.hpp"

int main() {
  BinomialQueue queue;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "insert") {
      queue.insert(args[0]);
      std::cout << queue.size() << "\n";
    } else if (op == "findmin" || op == "deletemin") {
      try {
        std::cout << (op == "findmin" ? queue.find_min() : queue.extract_min()) << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "merge") {
      BinomialQueue other;
      for (int key : args) other.insert(key);
      queue.merge_with(other);
      std::cout << queue.size() << "\n";
    } else if (op == "decrease") {
      BinomialQueue::Node* node = queue.find(args[0]);
      if (!node) {
        std::cout << "missing\n";
      } else {
        try {
          queue.decrease_key(node, args[1]);
          std::cout << "ok\n";
        } catch (const std::invalid_argument&) {
          std::cout << "bigger\n";
        }
      }
    } else if (op == "clear") {
      queue.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
