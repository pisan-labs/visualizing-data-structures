// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "cuckoo_table.hpp"

int main() {
  std::unique_ptr<CuckooTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0;
    words >> a;
    if (op == "new") {
      table = std::make_unique<CuckooTable>(a);
    } else if (op == "insert") {
      int before = table->rehashes();
      if (table->insert(a)) {
        std::cout << "added " << table->kicks();
        if (table->rehashes() != before) std::cout << " rehash " << table->size();
        std::cout << "\n";
      } else {
        std::cout << "present\n";
      }
    } else if (op == "search") {
      int i = table->search(a);
      if (i) {
        std::cout << "found " << i << "\n";
      } else {
        std::cout << "missing\n";
      }
    } else if (op == "delete") {
      std::cout << (table->remove(a) ? "deleted" : "missing") << "\n";
    } else if (op == "clear") {
      table->clear();
      std::cout << "ok\n";
    } else if (op == "print") {
      for (int i = 0; i < 2; i++) {
        if (i == 1) std::cout << " |";
        for (int j = 0; j < table->size(); j++) {
          int x = table->at(i, j);
          std::cout << (i == 0 && j == 0 ? "" : " ");
          if (x < 0) {
            std::cout << "-";
          } else {
            std::cout << x;
          }
        }
      }
      std::cout << "\n";
    }
  }
  return 0;
}
