#pragma once
#include <stdexcept>
#include <vector>

// A singly linked circular list with only a tail pointer. tail->next is the front.
template <typename T>
class CircularLinkedList {
 public:
  CircularLinkedList() = default;
  CircularLinkedList(const CircularLinkedList&) = delete;
  CircularLinkedList& operator=(const CircularLinkedList&) = delete;
  ~CircularLinkedList() {
    while (tail_ != nullptr) removeFront();
  }

  void insertFront(const T& x) {
    Node* node = new Node{x};
    if (tail_ == nullptr) {
      node->next = node;  // one node: the node after the last one is itself
      tail_ = node;
    } else {
      node->next = tail_->next;
      tail_->next = node;
    }
    ++n_;
  }

  void insertBack(const T& x) {
    insertFront(x);       // the new node goes right after tail...
    tail_ = tail_->next;  // ...and moving tail makes it the back
  }

  T removeFront() {
    if (tail_ == nullptr) throw std::underflow_error("list is empty");
    Node* first = tail_->next;
    if (first == tail_) {
      tail_ = nullptr;
    } else {
      tail_->next = first->next;
    }
    T x = first->value;
    delete first;  // no garbage collector: free the node ourselves
    --n_;
    return x;
  }

  void rotate() {
    if (tail_ != nullptr) tail_ = tail_->next;
  }

  std::vector<T> traverse() const {
    std::vector<T> values;
    if (tail_ == nullptr) return values;
    const Node* cur = tail_->next;
    do {
      values.push_back(cur->value);
      cur = cur->next;
    } while (cur != tail_->next);  // back at the front: stop, there is no null
    return values;
  }

  int search(const T& x) const {
    if (tail_ == nullptr) return -1;
    const Node* cur = tail_->next;
    int i = 0;
    do {
      if (cur->value == x) return i;
      cur = cur->next;
      ++i;
    } while (cur != tail_->next);
    return -1;
  }

 private:
  struct Node {
    T value;
    Node* next = nullptr;
  };

  Node* tail_ = nullptr;
  int n_ = 0;
};
