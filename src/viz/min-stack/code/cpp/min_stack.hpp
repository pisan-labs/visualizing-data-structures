#pragma once
#include <stdexcept>
#include <vector>

// A stack that also returns its minimum in O(1), with a second stack of minimums.
class MinStack {
 public:
  void push(int x) {
    items_.push_back(x);
    if (mins_.empty() || x <= mins_.back()) mins_.push_back(x);
  }

  int pop() {
    int x = top();
    items_.pop_back();
    if (x == mins_.back()) mins_.pop_back();
    return x;
  }

  int top() const {
    if (items_.empty()) throw std::out_of_range("the stack is empty");
    return items_.back();
  }

  int get_min() const {
    if (mins_.empty()) throw std::out_of_range("the stack is empty");
    return mins_.back();
  }

  bool empty() const { return items_.empty(); }

 private:
  std::vector<int> items_;
  std::vector<int> mins_;  // mins_.back() is always the smallest value in items_
};
