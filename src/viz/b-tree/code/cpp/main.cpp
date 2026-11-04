// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "btree.hpp"

static void printKeys(const BTree& tree) {
  std::cout << "ok";
  for (int k : tree.keys()) std::cout << " " << k;
  std::cout << "\n";
}

int main() {
  BTree tree(3);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int k = 0;
    words >> k;
    if (op == "insert") {
      if (tree.insert(k)) {
        printKeys(tree);
      } else {
        std::cout << "duplicate\n";
      }
    } else if (op == "delete") {
      if (tree.remove(k)) {
        printKeys(tree);
      } else {
        std::cout << "missing\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(k) ? "found" : "missing") << "\n";
    } else if (op == "clear") {
      tree = BTree(3);
      std::cout << "ok\n";
    }
  }
  return 0;
}
