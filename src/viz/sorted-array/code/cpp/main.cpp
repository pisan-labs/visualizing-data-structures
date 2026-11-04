// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "sorted_array.hpp"

int main() {
  std::unique_ptr<SortedArray> array;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int x = 0;
    if (!(words >> op)) continue;
    words >> x;
    if (op == "new") {
      array = std::make_unique<SortedArray>(x);
    } else if (op == "insert") {
      try {
        array->insert(x);
        std::cout << "ok\n";
      } catch (const std::overflow_error&) {
        std::cout << "full\n";
      }
    } else if (op == "delete") {
      std::cout << (array->erase(x) ? "ok" : "missing") << "\n";
    } else if (op == "search") {
      std::cout << array->search(x) << "\n";
    } else if (op == "contains") {
      std::cout << (array->search(x) != -1 ? "true" : "false") << "\n";
    } else if (op == "min" || op == "max") {
      try {
        std::cout << (op == "min" ? array->min() : array->max()) << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else if (op == "lowerBound") {
      std::cout << array->lower_bound(x) << "\n";
    } else if (op == "upperBound") {
      std::cout << array->upper_bound(x) << "\n";
    } else {
      std::cerr << "unknown operation " << op << "\n";
      return 1;
    }
  }
  return 0;
}
