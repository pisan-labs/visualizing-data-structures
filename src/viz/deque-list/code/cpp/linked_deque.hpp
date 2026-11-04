#pragma once
#include <memory>
#include <stdexcept>
#include <utility>

// A double-ended queue on a doubly linked list with head and tail. Each node owns the next
// one; prev and tail are plain pointers, so ownership runs one way and nothing is freed twice.
template <typename T>
class LinkedDeque {
 public:
  LinkedDeque() = default;
  ~LinkedDeque() {
    while (head_) head_ = std::move(head_->next);
  }

  void add_first(const T& x) {
    auto node = std::make_unique<Node>(x);
    Node* first = head_.get();
    node->next = std::move(head_);
    if (first == nullptr) {
      tail_ = node.get();
    } else {
      first->prev = node.get();
    }
    head_ = std::move(node);
  }

  void add_last(const T& x) {
    auto node = std::make_unique<Node>(x);
    node->prev = tail_;
    Node* last = node.get();
    if (tail_ == nullptr) {
      head_ = std::move(node);
    } else {
      tail_->next = std::move(node);
    }
    tail_ = last;
  }

  T remove_first() {
    if (!head_) throw std::underflow_error("deque underflow");
    T x = head_->value;
    head_ = std::move(head_->next);  // the old first node is deleted here
    if (!head_) {
      tail_ = nullptr;
    } else {
      head_->prev = nullptr;
    }
    return x;
  }

  T remove_last() {
    if (!tail_) throw std::underflow_error("deque underflow");
    T x = tail_->value;
    tail_ = tail_->prev;
    if (tail_ == nullptr) {
      head_.reset();  // the only node is deleted here
    } else {
      tail_->next.reset();  // the old last node is deleted here
    }
    return x;
  }

  const T& peek_first() const {
    if (!head_) throw std::underflow_error("deque is empty");
    return head_->value;
  }

  const T& peek_last() const {
    if (!tail_) throw std::underflow_error("deque is empty");
    return tail_->value;
  }

 private:
  struct Node {
    explicit Node(const T& v) : value(v) {}
    T value;
    Node* prev = nullptr;
    std::unique_ptr<Node> next;
  };

  std::unique_ptr<Node> head_;
  Node* tail_ = nullptr;
};
