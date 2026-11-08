#pragma once
#include <stdexcept>
#include <utility>
#include <vector>

// A max-heap with d children per node, in an array indexed from 1 (slot 0 is not used).
// parent(i) = (i - 2) / d + 1, child(i, j) = d * (i - 1) + j + 1 for j = 1..d.
class DaryHeap {
 public:
  DaryHeap(int d, int capacity) : d_(d), a_(capacity + 1) {}

  int size() const { return n_; }

  void insert(int key) {
    if (n_ == static_cast<int>(a_.size()) - 1) throw std::overflow_error("heap overflow");
    a_[++n_] = key;
    sift_up(n_);
  }

  int extract_max() {
    if (n_ == 0) throw std::underflow_error("heap underflow");
    int top = a_[1];
    a_[1] = a_[n_--];
    sift_down(1);
    return top;
  }

  void build(const std::vector<int>& keys) {
    if (keys.size() > a_.size() - 1) throw std::overflow_error("heap overflow");
    n_ = static_cast<int>(keys.size());
    for (int i = 0; i < n_; i++) a_[i + 1] = keys[i];
    if (n_ > 1)
      for (int i = parent(n_); i >= 1; i--) sift_down(i);
  }

  void update_key(int i, int key) {
    if (i < 1 || i > n_) throw std::out_of_range("no such slot");
    int old = a_[i];
    a_[i] = key;
    if (key > old) sift_up(i);
    else if (key < old) sift_down(i);
  }

  void clear() { n_ = 0; }

 private:
  int d_;
  std::vector<int> a_;
  int n_ = 0;

  int parent(int i) const { return (i - 2) / d_ + 1; }  // i >= 2 here, so no negative division
  int child(int i, int j) const { return d_ * (i - 1) + j + 1; }

  void sift_up(int i) {
    while (i > 1 && a_[i] > a_[parent(i)]) {
      std::swap(a_[i], a_[parent(i)]);
      i = parent(i);
    }
  }

  void sift_down(int i) {
    while (true) {
      int largest = i;
      for (int j = 1; j <= d_; j++) {
        int c = child(i, j);
        if (c <= n_ && a_[c] > a_[largest]) largest = c;
      }
      if (largest == i) return;
      std::swap(a_[i], a_[largest]);
      i = largest;
    }
  }
};
