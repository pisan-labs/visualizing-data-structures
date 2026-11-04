#pragma once
#include <memory>
#include <stdexcept>
#include <utility>

// A FIFO queue on a singly linked list: dequeue at head, enqueue after tail. Each node owns
// the next one, so head owns the whole list; tail is a plain pointer to the last node.
template <typename T>
class LinkedQueue {
 public:
  LinkedQueue() = default;
  ~LinkedQueue() {
    while (head_) head_ = std::move(head_->next);
  }

  void enqueue(const T& x) {
    auto node = std::make_unique<Node>(x);
    Node* last = node.get();
    if (tail_ == nullptr) {
      head_ = std::move(node);
    } else {
      tail_->next = std::move(node);
    }
    tail_ = last;
  }

  T dequeue() {
    if (!head_) throw std::underflow_error("queue underflow");
    T x = head_->value;
    head_ = std::move(head_->next);  // the old head is deleted here
    if (!head_) tail_ = nullptr;
    return x;
  }

  const T& peek() const {
    if (!head_) throw std::underflow_error("queue is empty");
    return head_->value;
  }

  bool empty() const { return !head_; }

 private:
  struct Node {
    explicit Node(const T& v) : value(v) {}
    T value;
    std::unique_ptr<Node> next;
  };

  std::unique_ptr<Node> head_;
  Node* tail_ = nullptr;
};
