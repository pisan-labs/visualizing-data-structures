#pragma once
#include <stdexcept>
#include <vector>

// A FIFO queue in a fixed-size circular array. rear is the next free slot.
// One slot always stays empty, so front == rear means empty.
template <typename T>
class CircularQueue {
 public:
  explicit CircularQueue(int capacity) : data_(capacity) {}

  void enqueue(const T& x) {
    if ((rear_ + 1) % capacity() == front_) {
      throw std::overflow_error("queue overflow");
    }
    data_[rear_] = x;
    rear_ = (rear_ + 1) % capacity();
  }

  T dequeue() {
    if (front_ == rear_) {
      throw std::underflow_error("queue underflow");
    }
    T x = data_[front_];
    front_ = (front_ + 1) % capacity();
    return x;
  }

  const T& peek() const {
    if (front_ == rear_) {
      throw std::underflow_error("queue is empty");
    }
    return data_[front_];
  }

  void clear() {
    front_ = 0;
    rear_ = 0;
  }

  int size() const { return (rear_ - front_ + capacity()) % capacity(); }

 private:
  int capacity() const { return static_cast<int>(data_.size()); }

  std::vector<T> data_;
  int front_ = 0;
  int rear_ = 0;
};
