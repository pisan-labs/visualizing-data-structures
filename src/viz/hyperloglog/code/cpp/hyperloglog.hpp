#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <utility>
#include <vector>

// m = 2^b registers; each keeps the largest rho seen.
class HyperLogLog {
 public:
  explicit HyperLogLog(int b) : b_(b), m_(1 << b), regs_(m_, 0) {}

  int indexBits() const { return b_; }

  // MurmurHash3's 32-bit finalizer, keeping the top 16 bits.
  static uint32_t hash16(uint32_t h) {
    h ^= h >> 16;
    h *= 0x85ebca6bu;
    h ^= h >> 13;
    h *= 0xc2b2ae35u;
    h ^= h >> 16;
    return h >> 16;
  }

  // Adds x and returns {register, rho}.
  std::pair<int, int> add(int x) {
    const int bits = 16;  // hash width
    uint32_t h = hash16(static_cast<uint32_t>(x));
    int rest = bits - b_;
    int j = static_cast<int>(h >> rest);  // the first b bits pick the register
    uint32_t w = h & ((1u << rest) - 1);
    int rho = 1;
    for (int bit = rest - 1; bit >= 0 && !((w >> bit) & 1u); bit--) rho++;
    regs_[j] = std::max(regs_[j], rho);
    return {j, rho};
  }

  double estimate() const {
    double alpha = m_ == 16 ? 0.673 : m_ == 32 ? 0.697 : m_ == 64 ? 0.709 : 0.7213 / (1 + 1.079 / m_);
    double z = 0;
    int zeros = 0;
    for (int v : regs_) {
      z += std::pow(2.0, -v);
      if (v == 0) zeros++;
    }
    double e = alpha * m_ * m_ / z;
    if (e <= 2.5 * m_ && zeros > 0) e = m_ * std::log(static_cast<double>(m_) / zeros);  // small-range correction
    return e;
  }

 private:
  int b_;
  int m_;
  std::vector<int> regs_;
};
