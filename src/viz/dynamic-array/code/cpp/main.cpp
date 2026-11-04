// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "dynamic_array.hpp"

// The whole token must be an integer: "2.5" and "K" are not indices.
static bool to_index(const std::string& token, int& out) {
  try {
    std::size_t used = 0;
    out = std::stoi(token, &used);
    return used == token.size();
  } catch (const std::exception&) {
    return false;
  }
}

int main() {
  std::unique_ptr<DynamicArray<std::string>> array;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, a, b;
    if (!(words >> op)) continue;
    words >> a >> b;
    if (op == "new") {
      array = std::make_unique<DynamicArray<std::string>>(std::stoi(a));
      continue;
    }
    if (op == "capacity") {
      std::cout << array->capacity() << "\n";
    } else if (op == "append") {
      array->append(a);
      std::cout << "ok\n";
    } else if (op == "removeLast") {
      try {
        std::cout << array->remove_last() << "\n";
      } catch (const std::underflow_error&) {
        std::cout << "empty\n";
      }
    } else {
      int i = 0;
      try {
        if (!to_index(a, i)) throw std::out_of_range("not an index");
        if (op == "insert") {
          array->insert(i, b);
          std::cout << "ok\n";
        } else if (op == "removeAt") {
          std::cout << array->remove_at(i) << "\n";
        } else if (op == "get") {
          std::cout << array->get(i) << "\n";
        } else if (op == "set") {
          array->set(i, b);
          std::cout << "ok\n";
        } else {
          std::cerr << "unknown operation " << op << "\n";
          return 1;
        }
      } catch (const std::out_of_range&) {
        std::cout << "error\n";
      }
    }
  }
  return 0;
}
