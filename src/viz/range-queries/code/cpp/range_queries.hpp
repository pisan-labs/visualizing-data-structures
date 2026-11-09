#pragma once
#include <algorithm>
#include <cstddef>
#include <vector>

// Range sums: p[k] is the sum of the first k values, A[0..k).
class PrefixSums {
 public:
  explicit PrefixSums(const std::vector<int>& a) : a_(a), p_(a.size() + 1, 0) {
    for (std::size_t k = 0; k < a.size(); k++) {
      p_[k + 1] = p_[k] + a[k];
    }
  }

  // A[i] + ... + A[j], both ends included. O(1).
  long long sum(int i, int j) const { return p_[j + 1] - p_[i]; }

  // Set A[i] to x. Every prefix that includes A[i] changes: O(n).
  void update(int i, int x) {
    int d = x - a_[i];
    a_[i] = x;
    for (std::size_t k = i + 1; k < p_.size(); k++) {
      p_[k] += d;
    }
  }

 private:
  std::vector<int> a_;
  std::vector<long long> p_;
};

// Range minimums: m[k][i] is the smallest of A[i .. i + 2^k - 1].
class SparseTable {
 public:
  explicit SparseTable(const std::vector<int>& a) : m_{a}, lg_(a.size() + 1, 0) {
    int n = static_cast<int>(a.size());
    for (int len = 2; len <= n; len++) lg_[len] = lg_[len / 2] + 1;  // floor(log2(len))
    for (int k = 1; (1 << k) <= n; k++) {
      int half = 1 << (k - 1);
      std::vector<int> row(n - (1 << k) + 1);
      for (int i = 0; i < static_cast<int>(row.size()); i++) {
        row[i] = std::min(m_[k - 1][i], m_[k - 1][i + half]);
      }
      m_.push_back(row);
    }
  }

  // The smallest of A[i..j], from two windows that may overlap. O(1).
  int min(int i, int j) const {
    int k = lg_[j - i + 1];
    return std::min(m_[k][i], m_[k][j - (1 << k) + 1]);
  }

  // Set A[i] to x and recompute every window that contains i: O(n).
  void update(int i, int x) {
    m_[0][i] = x;
    int n = static_cast<int>(m_[0].size());
    for (int k = 1; k < static_cast<int>(m_.size()); k++) {
      int half = 1 << (k - 1);
      for (int t = std::max(0, i - (1 << k) + 1); t <= std::min(i, n - (1 << k)); t++) {
        m_[k][t] = std::min(m_[k - 1][t], m_[k - 1][t + half]);
      }
    }
  }

 private:
  std::vector<std::vector<int>> m_;
  std::vector<int> lg_;
};
