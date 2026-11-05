#pragma once
#include <vector>

// A set of small integers stored as the bits of one int: bit i is 1 when i is in the set.
// Unsigned, so shifts and x & -x are defined for every value.

inline unsigned set_bit(unsigned x, int i) { return x | (1u << i); }

inline unsigned clear_bit(unsigned x, int i) { return x & ~(1u << i); }

inline unsigned toggle_bit(unsigned x, int i) { return x ^ (1u << i); }

inline unsigned test_bit(unsigned x, int i) { return (x >> i) & 1u; }

// -x on an unsigned value is 2^32 - x: the same bits as two's complement.
inline unsigned lowest_bit(unsigned x) { return x & -x; }

inline int popcount(unsigned x) {
  int count = 0;
  while (x != 0) {
    x = x & (x - 1);  // clear the lowest 1
    count++;
  }
  return count;
}

// Every subset of {0, ..., n - 1}, as masks from 0 to 2^n - 1.
inline std::vector<unsigned> subsets(int n) {
  std::vector<unsigned> out;
  for (unsigned mask = 0; mask < (1u << n); mask++) out.push_back(mask);
  return out;
}

// Every subset of x, from x itself down to 0.
inline std::vector<unsigned> submasks(unsigned x) {
  std::vector<unsigned> out;
  unsigned sub = x;
  while (true) {
    out.push_back(sub);
    if (sub == 0) return out;
    sub = (sub - 1) & x;
  }
}
