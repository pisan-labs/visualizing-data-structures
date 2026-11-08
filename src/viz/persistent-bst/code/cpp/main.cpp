// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "persistent_bst.hpp"

static void preorder(const PersistentBST::Node* x, std::ostream& out) {
  if (x == nullptr) return;
  out << " " << x->key;
  preorder(x->left.get(), out);
  preorder(x->right.get(), out);
}

int main() {
  PersistentBST tree;
  int current = 0;  // updates apply to the version being viewed
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "clear") {
      tree = PersistentBST();
      current = 0;
      std::cout << "ok\n";
      continue;
    }
    int n = 0;
    words >> n;
    if (op == "insert" || op == "delete") {
      int v = op == "insert" ? tree.insert(current, n) : tree.remove(current, n);
      if (v < 0) {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      } else {
        current = v;
        std::cout << "v" << v << " " << tree.made;
        preorder(tree.versions[v].get(), std::cout);
        std::cout << "\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(current, n) ? "found" : "missing") << "\n";
    } else if (op == "view") {
      current = n;
      std::cout << "ok";
      preorder(tree.versions[n].get(), std::cout);
      std::cout << "\n";
    }
  }
  return 0;
}
