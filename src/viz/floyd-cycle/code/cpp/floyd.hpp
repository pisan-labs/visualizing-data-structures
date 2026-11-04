#pragma once
#include <optional>
#include <utility>

template <typename T>
struct Node {
  T value;
  Node* next = nullptr;
};

// Floyd's tortoise and hare, in O(1) extra space. Returns {mu, lambda}: the index
// where the cycle starts (the length of the tail before it) and the number of nodes
// in the cycle. Returns nothing if the list ends in nullptr.
template <typename T>
std::optional<std::pair<int, int>> findCycle(Node<T>* head) {
  Node<T>* slow = head;
  Node<T>* fast = head;
  while (fast != nullptr && fast->next != nullptr) {
    slow = slow->next;        // the tortoise moves one node
    fast = fast->next->next;  // the hare moves two
    if (slow == fast) break;
  }
  if (fast == nullptr || fast->next == nullptr) return std::nullopt;

  // Phase 2: the start of the cycle is as far from head as from the meeting point.
  slow = head;
  int mu = 0;
  while (slow != fast) {
    slow = slow->next;
    fast = fast->next;
    ++mu;
  }

  // Phase 3: walk once around the cycle to measure it.
  int lambda = 1;
  fast = slow->next;
  while (fast != slow) {
    fast = fast->next;
    ++lambda;
  }
  return std::make_pair(mu, lambda);
}
