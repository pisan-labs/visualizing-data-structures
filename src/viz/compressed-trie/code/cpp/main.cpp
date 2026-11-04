// Test driver: reads one operation per line, prints one result per line.
//   insert w | delete w  ->  "ok <words> <nodes>" (the root counts as a node), or
//                            "duplicate" / "missing"
//   search w             ->  "found" or "missing"
//   startswith p         ->  the words, in order, or "none"
//   clear                ->  "ok"
#include <iostream>
#include <sstream>
#include <string>
#include <utility>

#include "radix_tree.hpp"

// Words and nodes in the subtree at x.
static std::pair<int, int> count(const RadixTree::Node* x) {
  std::pair<int, int> total{x->end ? 1 : 0, 1};
  for (const auto& entry : x->children) {
    auto sub = count(entry.second.get());
    total.first += sub.first;
    total.second += sub.second;
  }
  return total;
}

int main() {
  RadixTree tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    std::string arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "insert" || op == "delete") {
      bool done = op == "insert" ? tree.insert(arg) : tree.remove(arg);
      if (done) {
        auto [w, n] = count(tree.root.get());
        std::cout << "ok " << w << " " << n << "\n";
      } else {
        std::cout << (op == "insert" ? "duplicate" : "missing") << "\n";
      }
    } else if (op == "search") {
      std::cout << (tree.search(arg) ? "found" : "missing") << "\n";
    } else if (op == "startswith") {
      auto found = tree.startsWith(arg);
      if (found.empty()) std::cout << "none";
      for (std::size_t i = 0; i < found.size(); i++) std::cout << (i ? " " : "") << found[i];
      std::cout << "\n";
    } else if (op == "clear") {
      tree = RadixTree();
      std::cout << "ok\n";
    }
  }
  return 0;
}
