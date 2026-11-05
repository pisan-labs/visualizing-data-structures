// Test driver: reads one operation per line, prints one line per query result.
//   build 5 3 8 1  |  add i delta  |  prefix i  |  sum l r
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "fenwick_tree.hpp"

int main() {
  std::unique_ptr<FenwickTree> tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "build") {
      tree = std::make_unique<FenwickTree>(args);
    } else if (op == "add") {
      tree->add(args[0], args[1]);
    } else if (op == "prefix") {
      std::cout << tree->prefix(args[0]) << "\n";
    } else if (op == "sum") {
      std::cout << tree->sum(args[0], args[1]) << "\n";
    }
  }
  return 0;
}
