// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "chained_hash_table.hpp"

int main() {
  std::unique_ptr<ChainedHashTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int arg = 0;
    words >> arg;
    if (op == "new") {
      table = std::make_unique<ChainedHashTable>(arg);
    } else if (op == "insert") {
      bool added = table->insert(arg);
      std::cout << table->h(arg) << (added ? " added\n" : " present\n");
    } else if (op == "search") {
      bool found = table->contains(arg);
      std::cout << table->h(arg) << (found ? " found\n" : " missing\n");
    } else if (op == "delete") {
      bool deleted = table->remove(arg);
      std::cout << table->h(arg) << (deleted ? " deleted\n" : " missing\n");
    } else if (op == "clear") {
      table->clear();
      std::cout << "ok\n";
    } else if (op == "print") {
      for (int i = 0; i < table->buckets(); i++) {
        if (i > 0) std::cout << " | ";
        auto keys = table->chain(i);
        if (keys.empty()) std::cout << "-";
        for (size_t j = 0; j < keys.size(); j++) std::cout << (j ? " " : "") << keys[j];
      }
      std::cout << "\n";
    }
  }
  return 0;
}
