// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "aa_tree.hpp"

using Node = AATree::Node;

static void preorder(const Node* t, std::ostream& out) {
  if (t == nullptr) return;
  out << " " << t->key << ":" << t->level;
  preorder(t->left, out);
  preorder(t->right, out);
}

static void inorder(const Node* t, std::vector<int>& keys) {
  if (t == nullptr) return;
  inorder(t->left, keys);
  keys.push_back(t->key);
  inorder(t->right, keys);
}

int main() {
  auto tree = std::make_unique<AATree>();
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int k = 0;
    words >> k;
    if (op == "insert" || op == "delete") {
      int skews = tree->skews;
      int splits = tree->splits;
      bool done = op == "insert" ? tree->insert(k) : tree->remove(k);
      if (done) {
        std::cout << "ok " << tree->size << " " << tree->skews - skews << " "
                  << tree->splits - splits;
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
      tree = std::make_unique<AATree>();
      std::cout << "ok\n";
    }
  }
  return 0;
}
