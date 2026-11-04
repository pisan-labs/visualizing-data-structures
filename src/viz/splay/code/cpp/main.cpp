// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "splay.hpp"

using Tree = SplayTree<int>;

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
    int before = tree.rotations;
    if (op == "insert" || op == "delete") {
      bool insert = op == "insert";
      bool done = insert ? tree.insert(k) : tree.remove(k);
      std::cout << (done ? "ok" : insert ? "duplicate" : "missing") << " " << tree.size << " "
                << tree.height(tree.root) << " " << tree.rotations - before;
      preorder(tree.root, std::cout);
      std::cout << "\n";
    } else if (op == "search") {
      std::cout << (tree.search(k) ? "found" : "missing") << " " << tree.rotations - before;
      preorder(tree.root, std::cout);
      std::cout << "\n";
    } else if (op == "min" || op == "max") {
      if (tree.root == nullptr) {
        std::cout << "empty\n";
      } else {
        const Tree::Node* x = op == "min" ? tree.minimum() : tree.maximum();
        std::cout << x->key << " " << tree.rotations - before;
        preorder(tree.root, std::cout);
        std::cout << "\n";
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
