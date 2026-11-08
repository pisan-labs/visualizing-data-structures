#pragma once
#include <vector>

// m bits and k hash functions h_i(x) = ((A[i]*x + B[i]) mod P) mod m. There is no delete: a
// bit may belong to several keys.
class BloomFilter {
 public:
  BloomFilter(int m, int k) : m_(m), k_(k), bits_(m, false) {}

  std::vector<int> positions(int x) const {
    static const int A[] = {71, 113, 157, 211, 263, 307};
    static const int B[] = {5, 17, 29, 43, 61, 83};
    const int P = 1009;  // a prime larger than every key
    std::vector<int> js;
    for (int i = 0; i < k_; i++) js.push_back((A[i] * x + B[i]) % P % m_);
    return js;
  }

  void insert(int x) {
    for (int j : positions(x)) bits_[j] = true;
  }

  // false: x was never inserted. true: x was probably inserted.
  bool query(int x) const {
    for (int j : positions(x)) {
      if (!bits_[j]) return false;
    }
    return true;
  }

  void clear() { bits_.assign(m_, false); }

 private:
  int m_;
  int k_;
  std::vector<bool> bits_;
};
