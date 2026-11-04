// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "bst.hpp"

using Tree = BST<int>;

static std::string keyOr(const Tree::Node* x, const std::string& missing) {
  return x == nullptr ? missing : std::to_string(x->key);
}

int main() {
  Tree tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int k = 0;
    words >> k;
    if (op == "insert" || op == "delete") {
      bool done = op == "insert" ? tree.insert(k) : tree.remove(k);
      if (done) {
        std::cout << "ok " << Tree::size(tree.root) << " " << tree.height(tree.root) << "\n";
      } else {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(k) != nullptr ? "found" : "missing") << "\n";
    } else if (op == "min" || op == "max") {
      if (tree.root == nullptr) {
        std::cout << "empty\n";
      } else {
        const Tree::Node* x = op == "min" ? Tree::minimum(tree.root) : Tree::maximum(tree.root);
        std::cout << x->key << "\n";
      }
    } else if (op == "successor" || op == "predecessor") {
      Tree::Node* x = tree.search(k);
      if (x == nullptr) {
        std::cout << "missing\n";
      } else {
        const Tree::Node* y = op == "successor" ? Tree::successor(x) : Tree::predecessor(x);
        std::cout << keyOr(y, "none") << "\n";
      }
    } else if (op == "select") {
      std::cout << keyOr(tree.select(k), "none") << "\n";
    } else if (op == "rank") {
      int r = tree.rank(k);
      std::cout << (r < 0 ? "missing" : std::to_string(r)) << "\n";
    } else if (op == "lowerbound") {
      std::cout << keyOr(tree.lowerBound(k), "none") << "\n";
    } else if (op == "inorder") {
      std::vector<int> keys;
      tree.inorder(tree.root, keys);
      if (keys.empty()) std::cout << "empty";
      for (std::size_t i = 0; i < keys.size(); i++) std::cout << (i ? " " : "") << keys[i];
      std::cout << "\n";
    } else if (op == "clear") {
      tree.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
