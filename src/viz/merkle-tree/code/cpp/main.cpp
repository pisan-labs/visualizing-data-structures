// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "merkle_tree.hpp"

const int MAX_BLOCKS = 8;  // the page draws at most this many

int main() {
  MerkleTree tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<std::string> args;
    std::string w;
    while (words >> w) args.push_back(w);
    if (op == "build") {
      tree = MerkleTree(args);
      std::cout << tree.root() << "\n";
    } else if (op == "update") {
      try {
        tree.update(std::stoi(args[0]), args[1]);
        std::cout << tree.root() << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "append") {
      if (tree.size() >= MAX_BLOCKS) {
        std::cout << "full\n";
      } else {
        tree.append(args[0]);
        std::cout << tree.root() << "\n";
      }
    } else if (op == "prove") {
      try {
        auto proof = tree.proof(std::stoi(args[0]));
        std::string text;
        for (const auto& [side, h] : proof) text += (text.empty() ? "" : " ") + std::string(1, side) + ":" + h;
        std::cout << (text.empty() ? "-" : text) << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "verify") {
      try {
        auto proof = tree.proof(std::stoi(args[0]));
        std::cout << (MerkleTree::verify(args[1], proof, tree.root()) ? "ok" : "bad") << "\n";
      } catch (const std::out_of_range&) {
        std::cout << "invalid\n";
      }
    } else if (op == "clear") {
      tree = MerkleTree();
      std::cout << "ok\n";
    }
  }
  return 0;
}
