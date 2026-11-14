// Test driver: "build v1 v2 ..." makes the list; "reverse k" reverses it in groups of k (a
// short last group stays), "reverse k all" reverses a short last group too; both print the list.
#include <deque>
#include <iostream>
#include <sstream>
#include <string>

#include "reverse_k.hpp"

int main() {
  std::deque<Node> nodes;  // owns the nodes; a deque never moves them
  Node* head = nullptr;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "build") {
      nodes.clear();
      head = nullptr;
      Node* tail = nullptr;
      int v;
      while (words >> v) {
        nodes.push_back(Node{v});
        if (tail == nullptr) {
          head = &nodes.back();
        } else {
          tail->next = &nodes.back();
        }
        tail = &nodes.back();
      }
    } else if (op == "reverse") {
      int k;
      std::string all;
      words >> k >> all;
      head = reverseKGroup(head, k, all == "all");
      for (Node* n = head; n != nullptr; n = n->next) {
        std::cout << n->value << (n->next != nullptr ? " " : "");
      }
      std::cout << "\n";
    }
  }
  return 0;
}
