#pragma once
#include <cstddef>
#include <vector>

// Prefix sums that allow updates. 1-based: t[i] holds A[i - (i & -i) + 1] + ... + A[i].
class FenwickTree {
 public:
  // Build in O(n): copy A, then pass each t[i] up to the next range that contains it.
  explicit FenwickTree(const std::vector<int>& values) : t_(values.size() + 1, 0) {
    int n = static_cast<int>(values.size());
    for (int i = 1; i <= n; i++) {
      t_[i] = values[i - 1];
    }
    for (int i = 1; i <= n; i++) {
      int j = i + (i & -i);
      if (j <= n) {
        t_[j] += t_[i];
      }
    }
  }

  // A[i] += delta. Every range that contains i changes: O(log n).
  void add(int i, long long delta) {
    for (; i < static_cast<int>(t_.size()); i += i & -i) {
      t_[i] += delta;
    }
  }

  // A[1] + ... + A[i]: one range per 1 bit of i, O(log n).
  long long prefix(int i) const {
    long long total = 0;
    for (; i > 0; i -= i & -i) {
      total += t_[i];
    }
    return total;
  }

  // A[l] + ... + A[r], both ends included.
  long long sum(int l, int r) const { return prefix(r) - prefix(l - 1); }

 private:
  std::vector<long long> t_;
};
