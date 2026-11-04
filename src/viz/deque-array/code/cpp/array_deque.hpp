#pragma once
#include <stdexcept>
#include <vector>

// A double-ended queue in a fixed-size circular array. front is the first item and rear is
// the slot after the last item. One slot always stays empty, so front == rear means empty.
template <typename T>
class ArrayDeque {
 public:
  explicit ArrayDeque(int capacity) : data_(capacity) {}

  bool full() const { return (rear_ + 1) % capacity() == front_; }
  bool empty() const { return front_ == rear_; }

  void add_first(const T& x) {
    if (full()) throw std::overflow_error("deque overflow");
    // In C++, -1 % n is -1, so add the capacity before taking the remainder.
    front_ = (front_ - 1 + capacity()) % capacity();
    data_[front_] = x;
  }

  void add_last(const T& x) {
    if (full()) throw std::overflow_error("deque overflow");
    data_[rear_] = x;
    rear_ = (rear_ + 1) % capacity();
  }

  T remove_first() {
    if (empty()) throw std::underflow_error("deque underflow");
    T x = data_[front_];
    front_ = (front_ + 1) % capacity();
    return x;
  }

  T remove_last() {
    if (empty()) throw std::underflow_error("deque underflow");
    rear_ = (rear_ - 1 + capacity()) % capacity();
    return data_[rear_];
  }

  const T& peek_first() const {
    if (empty()) throw std::underflow_error("deque is empty");
    return data_[front_];
  }

  const T& peek_last() const {
    if (empty()) throw std::underflow_error("deque is empty");
    return data_[(rear_ - 1 + capacity()) % capacity()];
  }

 private:
  int capacity() const { return static_cast<int>(data_.size()); }

  std::vector<T> data_;
  int front_ = 0;
  int rear_ = 0;
};
