// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "floyd.hpp"

using StrNode = Node<std::string>;

// "1 2 3 4 @1": link the nodes in order; the last one points back to index 1.
// The vector owns the nodes, so a cycle never leaks.
StrNode* build(std::istringstream& words, std::vector<std::unique_ptr<StrNode>>& nodes) {
  nodes.clear();
  int loop = -1;
  std::string w;
  while (words >> w) {
    if (w[0] == '@') {
      loop = std::stoi(w.substr(1));
    } else {
      nodes.push_back(std::make_unique<StrNode>(StrNode{w}));
    }
  }
  for (size_t i = 0; i + 1 < nodes.size(); ++i) nodes[i]->next = nodes[i + 1].get();
  if (loop >= 0) nodes.back()->next = nodes[loop].get();
  return nodes.empty() ? nullptr : nodes[0].get();
}

int main() {
  std::vector<std::unique_ptr<StrNode>> nodes;
  StrNode* head = nullptr;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "build") {
      head = build(words, nodes);
      std::cout << "ok\n";
    } else if (op == "detect") {
      auto found = findCycle(head);
      if (found) {
        std::cout << found->first << " " << found->second << "\n";
      } else {
        std::cout << "none\n";
      }
    }
  }
  return 0;
}
