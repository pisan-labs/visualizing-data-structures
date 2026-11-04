#pragma once
#include <stdexcept>
#include <utility>
#include <vector>

// A max-heap in a fixed-size array, indexed from 1 as in CLRS: slot 0 is not used.
// parent(i) = i / 2, left(i) = 2i, right(i) = 2i + 1.
class MaxHeap {
 public:
  explicit MaxHeap(int capacity) : a_(capacity + 1) {}

  int size() const { return n_; }

  void insert(int key) {
    if (n_ == static_cast<int>(a_.size()) - 1) {
      throw std::overflow_error("heap overflow");
    }
    n_ = n_ + 1;
    a_[n_] = key;
    sift_up(n_);
  }

  int maximum() const {
    if (n_ == 0) {
      throw std::underflow_error("heap is empty");
    }
    return a_[1];
  }

  int extract_max() {
    if (n_ == 0) {
      throw std::underflow_error("heap underflow");
    }
    int max = a_[1];
    a_[1] = a_[n_];
    n_ = n_ - 1;
    max_heapify(1);
    return max;
  }

  // Bottom-up: copy the keys in, then sift down from the last parent to the root.
  void build(const std::vector<int>& keys) {
    if (keys.size() > a_.size() - 1) {
      throw std::overflow_error("heap overflow");
    }
    n_ = static_cast<int>(keys.size());
    for (int i = 0; i < n_; i++) {
      a_[i + 1] = keys[i];
    }
    for (int i = n_ / 2; i >= 1; i--) {
      max_heapify(i);
    }
  }

  void update_key(int i, int key) {
    if (i < 1 || i > n_) {
      throw std::out_of_range("no such slot");
    }
    int old = a_[i];
    a_[i] = key;
    if (key > old) {
      sift_up(i);
    } else if (key < old) {
      max_heapify(i);
    }
  }

  int remove(int i) {
    if (i < 1 || i > n_) {
      throw std::out_of_range("no such slot");
    }
    int old = a_[i];
    int last = a_[n_];
    n_ = n_ - 1;
    if (i <= n_) {
      a_[i] = last;
      if (last > old) {
        sift_up(i);
      } else if (last < old) {
        max_heapify(i);
      }
    }
    return old;
  }

  void clear() { n_ = 0; }

 private:
  void sift_up(int i) {
    while (i > 1 && a_[i / 2] < a_[i]) {
      std::swap(a_[i], a_[i / 2]);
      i = i / 2;
    }
  }

  void max_heapify(int i) {
    int left = 2 * i;
    int right = 2 * i + 1;
    int largest = (left <= n_ && a_[left] > a_[i]) ? left : i;
    if (right <= n_ && a_[right] > a_[largest]) {
      largest = right;
    }
    if (largest != i) {
      std::swap(a_[i], a_[largest]);
      max_heapify(largest);
    }
  }

  std::vector<int> a_;
  int n_ = 0;
};
