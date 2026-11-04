// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>

#include "linear_probing.hpp"

int main() {
  std::unique_ptr<LinearProbingTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int arg = 0;
    words >> arg;
    if (op == "new") {
      table = std::make_unique<LinearProbingTable>(arg);
    } else if (op == "insert") {
      try {
        bool added = table->insert(arg);
        std::cout << (added ? "added " : "present ") << table->probes() << "\n";
      } catch (const std::overflow_error&) {
        std::cout << "full " << table->probes() << "\n";
      }
    } else if (op == "search") {
      int j = table->search(arg);
      if (j < 0) {
        std::cout << "missing " << table->probes() << "\n";
      } else {
        std::cout << "found " << j << " " << table->probes() << "\n";
      }
    } else if (op == "delete") {
      bool deleted = table->remove(arg);
      std::cout << (deleted ? "deleted " : "missing ") << table->probes() << "\n";
    } else if (op == "clear") {
      table->clear();
      std::cout << "ok\n";
    } else if (op == "print") {
      for (int j = 0; j < table->size(); j++) std::cout << (j ? " " : "") << table->show(j);
      std::cout << "\n";
    }
  }
  return 0;
}
