// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "skip_list.hpp"

static void printKeys(const SkipList& list) {
  std::cout << "ok";
  for (int k : list.keys()) std::cout << " " << k;
  std::cout << "\n";
}

int main() {
  SkipList list;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int k = 0;
    words >> k;
    if (op == "insert") {
      if (list.insert(k)) {
        printKeys(list);
      } else {
        std::cout << "duplicate\n";
      }
    } else if (op == "delete") {
      if (list.remove(k)) {
        printKeys(list);
      } else {
        std::cout << "missing\n";
      }
    } else if (op == "search") {
      std::cout << (list.search(k) ? "found" : "missing") << "\n";
    } else if (op == "clear") {
      list.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
