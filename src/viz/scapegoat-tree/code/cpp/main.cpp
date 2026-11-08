// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "scapegoat.hpp"

using Node = ScapegoatTree::Node;

static void preorder(const Node* x, std::ostream& out) {
  if (x == nullptr) return;
  out << " " << x->key;
  preorder(x->left, out);
  preorder(x->right, out);
}

static void inorder(const Node* x, std::vector<int>& keys) {
  if (x == nullptr) return;
  inorder(x->left, keys);
  keys.push_back(x->key);
  inorder(x->right, keys);
}

int main() {
  auto tree = std::make_unique<ScapegoatTree>();
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int k = 0;
    words >> k;
    if (op == "insert" || op == "delete") {
      int before = tree->rebuilds;
      bool done = op == "insert" ? tree->insert(k) : tree->remove(k);
      if (done) {
        std::cout << "ok " << tree->n << " " << tree->height(tree->root) << " "
                  << tree->rebuilds - before;
        preorder(tree->root, std::cout);
        std::cout << "\n";
      } else {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      }
    } else if (op == "search") {
      std::cout << (tree->search(k) != nullptr ? "found" : "missing") << "\n";
    } else if (op == "inorder") {
      std::vector<int> keys;
      inorder(tree->root, keys);
      if (keys.empty()) std::cout << "empty";
      for (std::size_t i = 0; i < keys.size(); i++) std::cout << (i ? " " : "") << keys[i];
      std::cout << "\n";
    } else if (op == "clear") {
      tree = std::make_unique<ScapegoatTree>();
      std::cout << "ok\n";
    }
  }
  return 0;
}
