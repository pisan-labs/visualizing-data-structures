// Test driver: "build 1 4 7 | 2 3 8" makes the sorted lists (separated by |, "empty" for an
// empty one); "merge" merges them all into one and prints its values, or "empty".
#include <deque>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "merge.hpp"

int main() {
  std::deque<Node> nodes;  // owns the nodes; a deque never moves them
  std::vector<Node*> lists;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "build") {
      nodes.clear();
      lists.clear();
      lists.push_back(nullptr);
      Node* tail = nullptr;
      std::string w;
      while (words >> w) {
        if (w == "|") {
          lists.push_back(nullptr);
          tail = nullptr;
        } else if (w != "empty") {
          nodes.push_back(Node{std::stoi(w)});
          if (tail == nullptr) {
            lists.back() = &nodes.back();
          } else {
            tail->next = &nodes.back();
          }
          tail = &nodes.back();
        }
      }
    } else if (op == "merge") {
      Node* head = mergeAll(lists);
      lists = {head};
      if (head == nullptr) std::cout << "empty";
      for (Node* n = head; n != nullptr; n = n->next) {
        std::cout << n->value << (n->next != nullptr ? " " : "");
      }
      std::cout << "\n";
    }
  }
  return 0;
}
