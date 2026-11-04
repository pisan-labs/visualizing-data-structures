#pragma once
#include <stdexcept>
#include <vector>

// A stack stored in a fixed-size array. top counts the items.
template <typename T>
class ArrayStack {
 public:
  explicit ArrayStack(int capacity) : data_(capacity) {}

  void push(const T& x) {
    if (top_ == static_cast<int>(data_.size())) {
      throw std::overflow_error("stack overflow");
    }
    data_[top_] = x;
    top_ = top_ + 1;
  }

  T pop() {
    if (top_ == 0) {
      throw std::underflow_error("stack underflow");
    }
    top_ = top_ - 1;
    return data_[top_];
  }

  const T& peek() const {
    if (top_ == 0) {
      throw std::underflow_error("stack is empty");
    }
    return data_[top_ - 1];
  }

  void clear() { top_ = 0; }

  bool empty() const { return top_ == 0; }

 private:
  std::vector<T> data_;
  int top_ = 0;
};
