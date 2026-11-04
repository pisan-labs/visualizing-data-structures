#pragma once
#include <memory>
#include <stdexcept>

// An array that doubles when full and halves when a quarter full. Each resize copies every
// item, but resizes are rare enough that append costs O(1) amortized. (std::vector works
// this way; this class shows the moving parts.)
template <typename T>
class DynamicArray {
 public:
  explicit DynamicArray(int capacity = 1)
      : data_(std::make_unique<T[]>(capacity)), capacity_(capacity) {}

  int size() const { return size_; }
  int capacity() const { return capacity_; }

  void append(const T& x) {
    if (size_ == capacity_) resize(2 * capacity_);
    data_[size_] = x;
    size_ = size_ + 1;
  }

  void insert(int i, const T& x) {
    check(i, size_ + 1);
    if (size_ == capacity_) resize(2 * capacity_);
    for (int j = size_; j > i; j--) data_[j] = data_[j - 1];
    data_[i] = x;
    size_ = size_ + 1;
  }

  T remove_at(int i) {
    check(i, size_);
    T x = data_[i];
    for (int j = i; j < size_ - 1; j++) data_[j] = data_[j + 1];
    size_ = size_ - 1;
    shrink_if_sparse();
    return x;
  }

  T remove_last() {
    if (size_ == 0) throw std::underflow_error("array is empty");
    size_ = size_ - 1;
    T x = data_[size_];
    shrink_if_sparse();
    return x;
  }

  const T& get(int i) const {
    check(i, size_);
    return data_[i];
  }

  void set(int i, const T& x) {
    check(i, size_);
    data_[i] = x;
  }

 private:
  void check(int i, int limit) const {
    if (i < 0 || i >= limit) throw std::out_of_range("index out of range");
  }

  void resize(int capacity) {
    auto fresh = std::make_unique<T[]>(capacity);
    for (int k = 0; k < size_; k++) fresh[k] = data_[k];
    data_ = std::move(fresh);
    capacity_ = capacity;
  }

  void shrink_if_sparse() {
    if (size_ > 0 && size_ == capacity_ / 4) resize(capacity_ / 2);
  }

  std::unique_ptr<T[]> data_;
  int capacity_;
  int size_ = 0;
};
