#pragma once
#include <memory>
#include <stdexcept>
#include <utility>

// A stack on a singly linked list. top is the head of the list. Each node owns the next one,
// so popping a node frees it.
template <typename T>
class LinkedStack {
 public:
  LinkedStack() = default;
  // Free the nodes one at a time; letting each node free the next could overflow the call stack.
  ~LinkedStack() {
    while (top_) top_ = std::move(top_->next);
  }

  void push(const T& x) {
    auto node = std::make_unique<Node>(x);
    node->next = std::move(top_);
    top_ = std::move(node);
  }

  T pop() {
    if (!top_) throw std::underflow_error("stack underflow");
    T x = top_->value;
    top_ = std::move(top_->next);  // the old top is deleted here
    return x;
  }

  const T& peek() const {
    if (!top_) throw std::underflow_error("stack is empty");
    return top_->value;
  }

  bool empty() const { return !top_; }

 private:
  struct Node {
    explicit Node(const T& v) : value(v) {}
    T value;
    std::unique_ptr<Node> next;
  };

  std::unique_ptr<Node> top_;
};
