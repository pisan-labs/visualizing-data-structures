#pragma once
#include <stdexcept>
#include <vector>

// A fixed-capacity array of numbers kept in sorted order.
class SortedArray {
 public:
  explicit SortedArray(int capacity) : data_(capacity) {}

  void insert(int x) {
    if (size_ == static_cast<int>(data_.size())) throw std::overflow_error("array is full");
    int j = size_ - 1;
    while (j >= 0 && data_[j] > x) {
      data_[j + 1] = data_[j];
      j = j - 1;
    }
    data_[j + 1] = x;
    size_ = size_ + 1;
  }

  // Binary search: the index of x, or -1.
  int search(int x) const {
    int lo = 0, hi = size_ - 1;
    while (lo <= hi) {
      int mid = lo + (hi - lo) / 2;  // (lo + hi) / 2 can overflow on huge arrays
      if (data_[mid] == x) return mid;
      if (data_[mid] < x) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return -1;
  }

  bool erase(int x) {
    int i = search(x);
    if (i == -1) return false;
    for (int j = i; j < size_ - 1; j++) data_[j] = data_[j + 1];
    size_ = size_ - 1;
    return true;
  }

  int min() const {
    if (size_ == 0) throw std::underflow_error("array is empty");
    return data_[0];
  }

  int max() const {
    if (size_ == 0) throw std::underflow_error("array is empty");
    return data_[size_ - 1];
  }

  // The first index whose item is >= x (size if there is none), like std::lower_bound.
  int lower_bound(int x) const {
    int lo = 0, hi = size_;
    while (lo < hi) {
      int mid = lo + (hi - lo) / 2;
      if (data_[mid] < x) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  // The first index whose item is > x (size if there is none), like std::upper_bound.
  int upper_bound(int x) const {
    int lo = 0, hi = size_;
    while (lo < hi) {
      int mid = lo + (hi - lo) / 2;
      if (data_[mid] <= x) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

 private:
  std::vector<int> data_;
  int size_ = 0;
};
