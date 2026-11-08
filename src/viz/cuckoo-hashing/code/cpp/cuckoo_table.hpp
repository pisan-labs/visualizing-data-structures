#pragma once
#include <utility>
#include <vector>

// Two tables of m slots: key k lives in t[0][k mod m] or in t[1][(k div m) mod m].
class CuckooTable {
 public:
  static constexpr int kEmpty = -1;

  explicit CuckooTable(int m) : m_(m) { clear(); }

  int size() const { return m_; }
  int kicks() const { return kicks_; }
  int rehashes() const { return rehashes_; }
  int at(int i, int j) const { return t_[i][j]; }

  // 1 or 2, the table that holds k, or 0. Two probes at most.
  int search(int k) const {
    for (int i = 0; i < 2; i++) {
      if (t_[i][h(i, k)] == k) return i + 1;
    }
    return 0;
  }

  bool insert(int k) {
    if (search(k) != 0) return false;
    kicks_ = 0;
    int left = walk(k, true);
    if (left != kEmpty) rehash(left);
    return true;
  }

  bool remove(int k) {
    for (int i = 0; i < 2; i++) {
      int j = h(i, k);
      if (t_[i][j] == k) {
        t_[i][j] = kEmpty;
        return true;
      }
    }
    return false;
  }

  void clear() { t_.assign(2, std::vector<int>(m_, kEmpty)); }

 private:
  int h(int i, int k) const { return i == 0 ? k % m_ : (k / m_) % m_; }

  // Puts k in its T1 nest, kicking each old key to its other nest. Returns the key left
  // homeless when the kicks would go round forever, or kEmpty.
  int walk(int k, bool count) {
    int x = k, i = 0, homeless = 1;
    while (true) {
      int j = h(i, x);
      std::swap(x, t_[i][j]);
      if (x == kEmpty) return kEmpty;
      if (count) kicks_++;
      if (x == k && ++homeless == 3) return x;  // k kicked out twice: a cycle
      i = 1 - i;
    }
  }

  void rehash(int left) {
    std::vector<int> keys;
    for (const auto& row : t_) {
      for (int x : row) {
        if (x != kEmpty) keys.push_back(x);
      }
    }
    keys.push_back(left);
    for (bool done = false; !done;) {
      m_ = nextPrime(m_ + 1);  // new m: new hash functions
      rehashes_++;
      clear();
      done = true;
      for (int x : keys) {
        if (walk(x, false) != kEmpty) {
          done = false;
          break;
        }
      }
    }
  }

  static int nextPrime(int n) {
    for (;; n++) {
      bool prime = n >= 2;
      for (int d = 2; d * d <= n && prime; d++) prime = n % d != 0;
      if (prime) return n;
    }
  }

  int m_;
  std::vector<std::vector<int>> t_;
  int kicks_ = 0;
  int rehashes_ = 0;
};
