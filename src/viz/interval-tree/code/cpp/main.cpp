// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "interval_tree.hpp"

using Node = IntervalTree::Node;

static void preorder(const Node* x, std::ostream& out) {
  if (x == nullptr) return;
  out << " " << x->lo << "," << x->hi << "," << x->max;
  preorder(x->left, out);
  preorder(x->right, out);
}

int main() {
  auto tree = std::make_unique<IntervalTree>();
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "clear") {
      tree = std::make_unique<IntervalTree>();
      std::cout << "ok\n";
      continue;
    }
    int lo = 0;
    int hi = 0;
    words >> lo >> hi;
    if (op == "insert" || op == "delete") {
      bool done = op == "insert" ? tree->insert(lo, hi) : tree->remove(lo, hi);
      if (done) {
        std::cout << "ok " << tree->size << " " << tree->height(tree->root);
        preorder(tree->root, std::cout);
        std::cout << "\n";
      } else {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      }
    } else if (op == "overlap") {
      auto [x, visited] = tree->overlap(lo, hi);
      if (x == nullptr) std::cout << "none " << visited << "\n";
      else std::cout << x->lo << "," << x->hi << " " << visited << "\n";
    } else if (op == "all") {
      int visited = 0;
      auto found = tree->all(lo, hi, visited);
      std::cout << found.size();
      for (const Node* x : found) std::cout << " " << x->lo << "," << x->hi;
      std::cout << " visited " << visited << "\n";
    }
  }
  return 0;
}
