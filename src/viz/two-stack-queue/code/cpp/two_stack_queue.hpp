#pragma once
#include <cstddef>
#include <stack>
#include <stdexcept>

// A first-in, first-out queue made of two stacks: O(1) amortized per operation.
class TwoStackQueue {
 public:
  void enqueue(int x) { in_.push(x); }

  int dequeue() {
    int x = peek();
    out_.pop();
    return x;
  }

  int peek() {
    refill();
    if (out_.empty()) throw std::out_of_range("the queue is empty");
    return out_.top();
  }

  std::size_t size() const { return in_.size() + out_.size(); }

 private:
  // Only when out is empty: move everything across, which reverses the order.
  void refill() {
    if (!out_.empty()) return;
    while (!in_.empty()) {
      out_.push(in_.top());
      in_.pop();
    }
  }

  std::stack<int> in_;   // new values go on top
  std::stack<int> out_;  // the front of the queue is on top
};
