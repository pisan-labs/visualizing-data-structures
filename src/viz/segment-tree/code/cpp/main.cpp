// Test driver: reads one operation per line, prints one line per query result.
//   build 5 3 8 1  |  query l r  |  update i x  |  add l r x
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "segment_tree.hpp"

int main() {
  std::unique_ptr<SegmentTree> tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "build") {
      tree = std::make_unique<SegmentTree>(args);
    } else if (op == "query") {
      std::cout << tree->query(args[0], args[1]) << "\n";
    } else if (op == "update") {
      tree->update(args[0], args[1]);
    } else if (op == "add") {
      tree->add(args[0], args[1], args[2]);
    }
  }
  return 0;
}
