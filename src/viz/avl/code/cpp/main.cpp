// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "avl.hpp"

using Tree = AVLTree<int>;

static void preorder(const Tree::Node* x, std::ostream& out) {
  if (x == nullptr) return;
  out << " " << x->key;
  preorder(x->left, out);
  preorder(x->right, out);
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
      int before = tree.rotations;
      bool done = op == "insert" ? tree.insert(k) : tree.remove(k);
      if (done) {
        std::cout << "ok " << tree.size << " " << Tree::height(tree.root) << " "
                  << tree.rotations - before;
        preorder(tree.root, std::cout);
        std::cout << "\n";
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
