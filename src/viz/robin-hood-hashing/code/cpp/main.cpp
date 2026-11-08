// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>

#include "robin_hood_table.hpp"

int main() {
  std::unique_ptr<RobinHoodTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0;
    words >> a;
    if (op == "new") {
      table = std::make_unique<RobinHoodTable>(a);
    } else if (op == "insert") {
      try {
        int swaps = table->insert(a);
        if (swaps < 0) {
          std::cout << "present\n";
        } else {
          std::cout << "added " << table->probes() << " " << swaps << "\n";
        }
      } catch (const std::overflow_error&) {
        std::cout << "full\n";
      }
    } else if (op == "search") {
      int j = table->search(a);
      if (j < 0) {
        std::cout << "missing " << table->probes() << "\n";
      } else {
        std::cout << "found " << j << " " << table->probes() << "\n";
      }
    } else if (op == "delete") {
      int shifts = table->remove(a);
      if (shifts < 0) {
        std::cout << "missing\n";
      } else {
        std::cout << "deleted " << shifts << "\n";
      }
    } else if (op == "clear") {
      table = std::make_unique<RobinHoodTable>(table->size());
      std::cout << "ok\n";
    } else if (op == "print") {
      for (int j = 0; j < table->size(); j++) {
        int x = table->at(j);
        std::cout << (j ? " " : "");
        if (x < 0) {
          std::cout << "-";
        } else {
          std::cout << x;
        }
      }
      std::cout << "\n";
    }
  }
  return 0;
}
