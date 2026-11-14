// Test driver: "build v1 v2 ..." makes the list; "middle" (or "middle first") prints the
// middle value; "kth k" prints the k-th value from the end, or "none"; "palindrome" prints
// true or false; "list" prints the list.
#include <deque>
#include <iostream>
#include <sstream>
#include <string>

#include "fast_slow.hpp"

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
    } else if (op == "middle") {
      std::string which;
      words >> which;
      std::cout << (which == "first" ? firstMiddle(head) : middle(head))->value << "\n";
    } else if (op == "kth") {
      int k;
      words >> k;
      Node* node = kthFromEnd(head, k);
      if (node == nullptr) {
        std::cout << "none\n";
      } else {
        std::cout << node->value << "\n";
      }
    } else if (op == "palindrome") {
      std::cout << (isPalindrome(head) ? "true" : "false") << "\n";
    } else if (op == "list") {
      for (Node* n = head; n != nullptr; n = n->next) {
        std::cout << n->value << (n->next != nullptr ? " " : "");
      }
      std::cout << "\n";
    }
  }
  return 0;
}
