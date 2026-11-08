#pragma once
#include <stdexcept>
#include <utility>
#include <vector>

// Linear probing with h(k) = k mod m, where a key further from home takes the slot of a key
// closer to home. Deletion shifts the keys behind back, so there are no tombstones.
class RobinHoodTable {
 public:
  static constexpr int kEmpty = -1;

  explicit RobinHoodTable(int m) : m_(m), t_(m, kEmpty) {}

  int size() const { return m_; }
  int probes() const { return probes_; }
  int at(int j) const { return t_[j]; }

  // Returns the number of swaps, or -1 if k is already there; throws if the table is full.
  int insert(int k) {
    if (n_ == m_ && search(k) < 0) throw std::overflow_error("table full");
    int x = k, j = k % m_, d = 0, swaps = 0;
    for (int i = 0; i < m_; i++) {
      probes_ = i + 1;
      if (t_[j] == kEmpty) {
        t_[j] = x;
        n_++;
        return swaps;
      }
      if (swaps == 0 && t_[j] == k) return -1;
      if (dist(t_[j], j) < d) {  // take from the rich
        std::swap(x, t_[j]);
        d = dist(x, j);
        swaps++;
      }
      j = (j + 1) % m_;
      d++;
    }
    throw std::overflow_error("table full");
  }

  // The slot of k, or -1. Stops early at a key closer to home than k would be.
  int search(int k) {
    int j = k % m_;
    for (int d = 0; d < m_; d++) {
      probes_ = d + 1;
      if (t_[j] == kEmpty) return -1;
      if (t_[j] == k) return j;
      if (dist(t_[j], j) < d) return -1;
      j = (j + 1) % m_;
    }
    return -1;
  }

  // Returns the number of keys shifted back, or -1 if k is not there.
  int remove(int k) {
    int j = search(k);
    if (j < 0) return -1;
    t_[j] = kEmpty;
    n_--;
    int shifts = 0;
    int next = (j + 1) % m_;
    while (t_[next] != kEmpty && dist(t_[next], next) > 0) {
      t_[j] = t_[next];
      t_[next] = kEmpty;
      j = next;
      next = (next + 1) % m_;
      shifts++;
    }
    return shifts;
  }

 private:
  // How far slot j is from k's home slot: its probe distance.
  int dist(int k, int j) const { return ((j - k % m_) % m_ + m_) % m_; }

  int m_;
  std::vector<int> t_;
  int n_ = 0;
  int probes_ = 0;
};
