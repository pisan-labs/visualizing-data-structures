// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "bucket_hash_table.hpp"

int main() {
  std::unique_ptr<BucketHashTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0, b = 0;
    words >> a >> b;
    if (op == "new") {
      table = std::make_unique<BucketHashTable>(a, b);
    } else if (op == "insert") {
      bool added = table->insert(a);
      std::cout << (added ? "added " : "present ") << table->probes() << "\n";
    } else if (op == "search") {
      bool found = table->search(a);
      std::cout << (found ? "found " : "missing ") << table->probes() << "\n";
    } else if (op == "delete") {
      bool deleted = table->remove(a);
      std::cout << (deleted ? "deleted " : "missing ") << table->probes() << "\n";
    } else if (op == "clear") {
      table->clear();
      std::cout << "ok\n";
    } else if (op == "print") {
      std::cout << table->show() << "\n";
    }
  }
  return 0;
}
