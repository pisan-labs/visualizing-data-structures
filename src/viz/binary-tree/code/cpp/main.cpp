// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

#include "binary_tree.hpp"

static void print(const std::vector<std::string>& values) {
  if (values.empty()) {
    std::cout << "empty\n";
    return;
  }
  for (std::size_t i = 0; i < values.size(); i++) {
    std::cout << (i ? " " : "") << values[i];
  }
  std::cout << "\n";
}

int main() {
  std::unique_ptr<Node<std::string>> root;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<std::string> values;
    if (op == "build") {
      std::vector<std::optional<std::string>> list;
      std::string w;
      while (words >> w) {
        if (w == "_") {
          list.emplace_back(std::nullopt);
        } else {
          list.emplace_back(w);
        }
      }
      root = build(list);
      std::cout << size(root.get()) << " " << height(root.get()) << "\n";
    } else if (op == "preorder") {
      preorder(root.get(), values);
      print(values);
    } else if (op == "inorder") {
      inorder(root.get(), values);
      print(values);
    } else if (op == "postorder") {
      postorder(root.get(), values);
      print(values);
    } else if (op == "levelorder") {
      print(levelOrder(root.get()));
    }
  }
  return 0;
}
