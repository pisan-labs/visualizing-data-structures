// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "red_black.hpp"

using Tree = RedBlackTree<int>;

static void preorder(const Tree& tree, const Tree::Node* x, std::ostream& out) {
  if (x == tree.nil) return;
  out << " " << x->key << (x->color == Tree::RED ? "R" : "B");
  preorder(tree, x->left, out);
  preorder(tree, x->right, out);
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
        std::cout << "ok " << tree.size << " " << tree.height(tree.root) << " "
                  << tree.blackHeight() << " " << tree.rotations - before;
        preorder(tree, tree.root, std::cout);
        std::cout << "\n";
      } else {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(k) != tree.nil ? "found" : "missing") << "\n";
    } else if (op == "min" || op == "max") {
      if (tree.root == tree.nil) {
        std::cout << "empty\n";
      } else {
        const Tree::Node* x = op == "min" ? tree.minimum(tree.root) : tree.maximum(tree.root);
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
