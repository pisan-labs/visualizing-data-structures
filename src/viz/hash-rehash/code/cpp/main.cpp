// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "resizing_table.hpp"

int main() {
  std::unique_ptr<ResizingTable> table;
  int start = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int arg = 0;
    words >> arg;
    if (op == "new") {
      start = arg;
      table = std::make_unique<ResizingTable>(start);
    } else if (op == "insert") {
      int cost = table->insert(arg);
      if (cost > 0) {
        std::cout << "added " << table->capacity() << " " << cost << "\n";
      } else {
        std::cout << "present " << table->capacity() << "\n";
      }
    } else if (op == "search") {
      int j = table->search(arg);
      if (j < 0) {
        std::cout << "missing\n";
      } else {
        std::cout << "found " << j << "\n";
      }
    } else if (op == "clear") {
      table = std::make_unique<ResizingTable>(start);
      std::cout << "ok\n";
    } else if (op == "print") {
      std::cout << table->show() << " | " << table->total() << "\n";
    }
  }
  return 0;
}
