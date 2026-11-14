#pragma once

struct Node {
  int value;
  Node* next = nullptr;
};

// The middle node. With two middles (an even count), the second.
inline Node* middle(Node* head) {
  Node* slow = head;
  Node* fast = head;
  while (fast != nullptr && fast->next != nullptr) {
    slow = slow->next;        // one node
    fast = fast->next->next;  // two nodes
  }
  return slow;
}

// The middle node. With two middles, the first: fast stops one node earlier.
inline Node* firstMiddle(Node* head) {
  Node* slow = head;
  Node* fast = head;
  while (fast->next != nullptr && fast->next->next != nullptr) {
    slow = slow->next;
    fast = fast->next->next;
  }
  return slow;
}

// The k-th node from the end (k = 1 is the last), or nullptr if the list is shorter.
inline Node* kthFromEnd(Node* head, int k) {
  Node* fast = head;
  for (int i = 0; i < k; ++i) {  // a gap of k
    if (fast == nullptr) return nullptr;
    fast = fast->next;
  }
  Node* slow = head;
  while (fast != nullptr) {
    slow = slow->next;
    fast = fast->next;
  }
  return slow;
}

// Turn the next pointers around; return the new first node.
inline Node* reverse(Node* head) {
  Node* prev = nullptr;
  while (head != nullptr) {
    Node* next = head->next;
    head->next = prev;
    prev = head;
    head = next;
  }
  return prev;
}

// Same values forwards and backwards? O(1) extra space; the list is put back.
inline bool isPalindrome(Node* head) {
  Node* back = reverse(middle(head));  // the second half, turned around
  bool same = true;
  for (Node *left = head, *right = back; right != nullptr; left = left->next, right = right->next) {
    if (left->value != right->value) {
      same = false;
      break;
    }
  }
  reverse(back);  // put the second half back as it was
  return same;
}
