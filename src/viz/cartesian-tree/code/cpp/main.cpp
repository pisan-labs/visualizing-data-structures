// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "cartesian_tree.hpp"

int main() {
  CartesianTree tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "append") {
      int x = 0;
      words >> x;
      int pops = tree.append(x);
      std::vector<int> keys;
      tree.preorder(tree.root, keys);
      std::cout << "ok " << pops;
      for (int k : keys) std::cout << " " << k;
      std::cout << "\n";
    } else if (op == "rmq") {
      int a = 0;
      int b = 0;
      words >> a >> b;
      int i = std::min(a, b);
      int j = std::max(a, b);
      if (j >= static_cast<int>(tree.values.size())) {
        std::cout << "bad\n";
      } else {
        auto [x, visited] = tree.rmq(i, j);
        std::cout << x << " " << tree.values[x] << " " << visited << "\n";
      }
    } else if (op == "clear") {
      tree = CartesianTree();
      std::cout << "ok\n";
    }
  }
  return 0;
}
