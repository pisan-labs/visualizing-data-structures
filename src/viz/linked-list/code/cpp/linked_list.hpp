#pragma once
#include <stdexcept>

// A singly linked list with head and tail pointers. Indexes start at 0.
template <typename T>
class LinkedList {
 public:
  LinkedList() = default;
  LinkedList(const LinkedList&) = delete;
  LinkedList& operator=(const LinkedList&) = delete;
  ~LinkedList() {
    while (head_ != nullptr) {
      Node* next = head_->next;
      delete head_;
      head_ = next;
    }
  }

  void insertHead(const T& x) {
    Node* node = new Node{x};
    node->next = head_;  // first link the new node in...
    head_ = node;        // ...then move head, or the list is lost
    if (tail_ == nullptr) tail_ = node;
    ++n_;
  }

  void insertTail(const T& x) {
    Node* node = new Node{x};
    if (head_ == nullptr) {
      head_ = node;
    } else {
      tail_->next = node;
    }
    tail_ = node;
    ++n_;
  }

  void insertAt(int i, const T& x) {
    if (i < 0 || i > n_) throw std::out_of_range("index out of range");
    Node* node = new Node{x};
    if (i == 0) {
      node->next = head_;
      head_ = node;
    } else {
      Node* prev = head_;
      for (int k = 0; k < i - 1; ++k) prev = prev->next;
      node->next = prev->next;
      prev->next = node;
    }
    if (node->next == nullptr) tail_ = node;
    ++n_;
  }

  T removeHead() {
    if (head_ == nullptr) throw std::underflow_error("list is empty");
    Node* old = head_;
    T x = old->value;
    head_ = old->next;
    if (head_ == nullptr) tail_ = nullptr;
    delete old;  // no garbage collector: free the node ourselves
    --n_;
    return x;
  }

  T removeTail() {
    if (head_ == nullptr) throw std::underflow_error("list is empty");
    Node* last = tail_;
    if (head_->next == nullptr) {
      head_ = nullptr;
      tail_ = nullptr;
    } else {
      Node* prev = head_;
      while (prev->next != tail_) prev = prev->next;  // tail can't tell us its predecessor
      prev->next = nullptr;
      tail_ = prev;
    }
    T x = last->value;
    delete last;
    --n_;
    return x;
  }

  T removeAt(int i) {
    if (i < 0 || i >= n_) throw std::out_of_range("index out of range");
    Node* prev = nullptr;
    Node* cur = head_;
    for (int k = 0; k < i; ++k) {
      prev = cur;
      cur = cur->next;
    }
    return unlink(prev, cur);
  }

  bool removeValue(const T& x) {
    Node* prev = nullptr;
    Node* cur = head_;
    while (cur != nullptr && cur->value != x) {
      prev = cur;
      cur = cur->next;
    }
    if (cur == nullptr) return false;
    unlink(prev, cur);
    return true;
  }

  int search(const T& x) const {
    int i = 0;
    for (Node* cur = head_; cur != nullptr; cur = cur->next, ++i) {
      if (cur->value == x) return i;
    }
    return -1;
  }

  const T& get(int i) const {
    if (i < 0 || i >= n_) throw std::out_of_range("index out of range");
    Node* cur = head_;
    for (int k = 0; k < i; ++k) cur = cur->next;
    return cur->value;
  }

  void reverse() {
    Node* prev = nullptr;
    Node* cur = head_;
    tail_ = head_;
    while (cur != nullptr) {
      Node* next = cur->next;  // save the rest of the list first
      cur->next = prev;
      prev = cur;
      cur = next;
    }
    head_ = prev;
  }

  template <typename F>
  void forEach(F visit) const {
    for (Node* cur = head_; cur != nullptr; cur = cur->next) visit(cur->value);
  }

 private:
  struct Node {
    T value;
    Node* next = nullptr;
  };

  T unlink(Node* prev, Node* cur) {
    if (prev == nullptr) {
      head_ = cur->next;
    } else {
      prev->next = cur->next;
    }
    if (cur == tail_) tail_ = prev;
    T x = cur->value;
    delete cur;
    --n_;
    return x;
  }

  Node* head_ = nullptr;
  Node* tail_ = nullptr;
  int n_ = 0;
};
