#pragma once
#include <stdexcept>

// A doubly linked list with one sentinel node, nil. Indexes start at 0.
// nil.next is the first node and nil.prev the last; an empty list is nil
// pointing at itself both ways, so linking never meets a null pointer.
template <typename T>
class DoublyLinkedList {
 public:
  DoublyLinkedList() {
    nil_.next = &nil_;
    nil_.prev = &nil_;
  }
  DoublyLinkedList(const DoublyLinkedList&) = delete;
  DoublyLinkedList& operator=(const DoublyLinkedList&) = delete;
  ~DoublyLinkedList() {
    while (nil_.next != &nil_) unlink(nil_.next);
  }

  void insertHead(const T& x) { linkBefore(nil_.next, x); }

  void insertTail(const T& x) { linkBefore(&nil_, x); }

  void insertAt(int i, const T& x) {
    if (i < 0 || i > n_) throw std::out_of_range("index out of range");
    linkBefore(i == n_ ? &nil_ : nodeAt(i), x);
  }

  T removeHead() {
    if (nil_.next == &nil_) throw std::underflow_error("list is empty");
    return unlink(nil_.next);
  }

  T removeTail() {
    if (nil_.prev == &nil_) throw std::underflow_error("list is empty");
    return unlink(nil_.prev);
  }

  T removeAt(int i) {
    if (i < 0 || i >= n_) throw std::out_of_range("index out of range");
    return unlink(nodeAt(i));
  }

  bool removeValue(const T& x) {
    Node* cur = nil_.next;
    while (cur != &nil_ && cur->value != x) cur = cur->next;
    if (cur == &nil_) return false;
    unlink(cur);
    return true;
  }

  int search(const T& x) const {
    int i = 0;
    for (const Node* cur = nil_.next; cur != &nil_; cur = cur->next, ++i) {
      if (cur->value == x) return i;
    }
    return -1;
  }

  const T& get(int i) const {
    if (i < 0 || i >= n_) throw std::out_of_range("index out of range");
    return nodeAt(i)->value;
  }

  void reverse() {
    Node* cur = nil_.next;
    while (cur != &nil_) {
      Node* tmp = cur->next;
      cur->next = cur->prev;
      cur->prev = tmp;
      cur = tmp;
    }
    Node* tmp = nil_.next;
    nil_.next = nil_.prev;
    nil_.prev = tmp;
  }

  template <typename F>
  void forEach(F visit) const {
    for (const Node* cur = nil_.next; cur != &nil_; cur = cur->next) visit(cur->value);
  }

 private:
  struct Node {
    T value{};
    Node* next = nullptr;
    Node* prev = nullptr;
  };

  void linkBefore(Node* succ, const T& x) {
    Node* node = new Node{x};
    node->next = succ;
    node->prev = succ->prev;
    succ->prev->next = node;  // while succ->prev is still the node before succ
    succ->prev = node;
    ++n_;
  }

  T unlink(Node* cur) {
    cur->prev->next = cur->next;
    cur->next->prev = cur->prev;
    T x = cur->value;
    delete cur;  // no garbage collector: free the node ourselves
    --n_;
    return x;
  }

  Node* nodeAt(int i) const {
    Node* cur;
    if (2 * i < n_) {  // front half: walk forward from the first node
      cur = nil_.next;
      for (int k = 0; k < i; ++k) cur = cur->next;
    } else {  // back half: walk back from the last node
      cur = nil_.prev;
      for (int k = 0; k < n_ - 1 - i; ++k) cur = cur->prev;
    }
    return cur;
  }

  Node nil_;
  int n_ = 0;
};
