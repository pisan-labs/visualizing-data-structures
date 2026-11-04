// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "bplus_tree.hpp"

static void print(const std::string& head, const std::vector<int>& keys) {
  std::cout << head;
  for (std::size_t i = 0; i < keys.size(); i++) {
    std::cout << (head.empty() && i == 0 ? "" : " ") << keys[i];
  }
  std::cout << "\n";
}

int main() {
  BPlusTree tree(4);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0;
    int b = 0;
    words >> a >> b;
    if (op == "insert") {
      if (tree.insert(a)) {
        print("ok", tree.keys());
      } else {
        std::cout << "duplicate\n";
      }
    } else if (op == "delete") {
      if (tree.remove(a)) {
        print("ok", tree.keys());
      } else {
        std::cout << "missing\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(a) ? "found" : "missing") << "\n";
    } else if (op == "range") {
      std::vector<int> keys = tree.range(a, b);
      if (keys.empty()) {
        std::cout << "empty\n";
      } else {
        print("", keys);
      }
    } else if (op == "clear") {
      tree = BPlusTree(4);
      std::cout << "ok\n";
    }
  }
  return 0;
}
