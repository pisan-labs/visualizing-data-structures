#pragma once
#include <stdexcept>
#include <utility>
#include <vector>

// A min-max heap in an array indexed from 1 (slot 0 is not used). Even depths (the root's) are
// min levels, odd depths are max levels.
class MinMaxHeap {
 public:
  explicit MinMaxHeap(int capacity) : a_(capacity + 1) {}

  int size() const { return n_; }

  void insert(int key) {
    if (n_ == static_cast<int>(a_.size()) - 1) throw std::overflow_error("heap overflow");
    a_[++n_] = key;
    push_up(n_);
  }

  int extract_min() {
    if (n_ == 0) throw std::underflow_error("heap is empty");
    return remove(1);
  }

  int extract_max() {
    if (n_ == 0) throw std::underflow_error("heap is empty");
    int m = 1;
    if (n_ >= 2) m = (n_ >= 3 && a_[3] > a_[2]) ? 3 : 2;
    return remove(m);
  }

  void build(const std::vector<int>& keys) {
    if (keys.size() > a_.size() - 1) throw std::overflow_error("heap overflow");
    n_ = static_cast<int>(keys.size());
    for (int i = 0; i < n_; i++) a_[i + 1] = keys[i];
    for (int i = n_ / 2; i >= 1; i--) trickle_down(i);
  }

  void clear() { n_ = 0; }

 private:
  std::vector<int> a_;
  int n_ = 0;

  static bool on_min_level(int i) {
    int depth = 0;
    while (i > 1) {
      i /= 2;
      depth++;
    }
    return depth % 2 == 0;
  }

  // x belongs nearer the top than y, on a min level (min) or a max level.
  static bool better(bool min, int x, int y) { return min ? x < y : x > y; }

  int remove(int m) {
    int x = a_[m];
    a_[m] = a_[n_--];
    if (m <= n_) trickle_down(m);
    return x;
  }

  void push_up(int i) {
    if (i == 1) return;
    int p = i / 2;
    bool min = on_min_level(i);
    if (better(!min, a_[i], a_[p])) {
      std::swap(a_[i], a_[p]);
      push_up_side(p, !min);
    } else {
      push_up_side(i, min);
    }
  }

  void push_up_side(int i, bool min) {
    while (i >= 4 && better(min, a_[i], a_[i / 4])) {
      std::swap(a_[i], a_[i / 4]);
      i /= 4;
    }
  }

  void trickle_down(int i) {
    bool min = on_min_level(i);
    while (2 * i <= n_) {
      int m = 2 * i;
      for (int c : {2 * i + 1, 4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3})
        if (c <= n_ && better(min, a_[c], a_[m])) m = c;
      if (!better(min, a_[m], a_[i])) return;
      std::swap(a_[i], a_[m]);
      if (m <= 2 * i + 1) return;
      if (better(min, a_[m / 2], a_[m])) std::swap(a_[m], a_[m / 2]);
      i = m;
    }
  }
};
