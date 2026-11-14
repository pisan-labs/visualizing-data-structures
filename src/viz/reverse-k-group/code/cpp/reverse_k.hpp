#pragma once

struct Node {
  int value;
  Node* next = nullptr;
};

// Reverse the list in groups of k, in place. A last group shorter than k stays as it is, or
// is reversed too when reverseRest is true. O(n) time, O(1) extra space.
inline Node* reverseKGroup(Node* head, int k, bool reverseRest = false) {
  Node dummy{0, head};  // gives the first group a node before it
  Node* before = &dummy;  // the node before the next group
  while (before->next != nullptr) {
    Node* kth = before;
    int count = 0;
    while (count < k && kth->next != nullptr) {  // find the group's last node
      kth = kth->next;
      ++count;
    }
    if (count < k && !reverseRest) break;  // a short last group stays as it is
    Node* after = kth->next;
    Node* prev = after;  // the group's new last node will point at the rest
    Node* cur = before->next;
    Node* first = cur;
    while (cur != after) {
      Node* next = cur->next;
      cur->next = prev;
      prev = cur;
      cur = next;
    }
    before->next = kth;  // link the turned-around group in
    before = first;      // its old first node is now its last
  }
  return dummy.next;
}
