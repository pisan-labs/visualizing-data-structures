#pragma once
#include <vector>

struct Node {
  int value;
  Node* next = nullptr;
};

// Merge two sorted lists into one by relinking their nodes. O(m + n), no new nodes.
inline Node* merge(Node* a, Node* b) {
  Node dummy{0};  // a fake head: the first node is linked like every other
  Node* tail = &dummy;
  while (a != nullptr && b != nullptr) {
    if (a->value <= b->value) {  // on a tie take a, so equal values keep their order
      tail->next = a;
      a = a->next;
    } else {
      tail->next = b;
      b = b->next;
    }
    tail = tail->next;
  }
  tail->next = (a != nullptr) ? a : b;  // the rest of the other list is already in order
  return dummy.next;
}

// Merge k sorted lists in pairs, round after round: O(N log k).
inline Node* mergeAll(std::vector<Node*> lists) {
  if (lists.empty()) return nullptr;
  while (lists.size() > 1) {
    std::vector<Node*> next;
    for (size_t i = 0; i < lists.size(); i += 2) {
      next.push_back(i + 1 < lists.size() ? merge(lists[i], lists[i + 1]) : lists[i]);
    }
    lists = next;
  }
  return lists[0];
}
