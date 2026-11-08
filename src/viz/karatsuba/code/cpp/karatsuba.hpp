#pragma once
#include <algorithm>
#include <string>

inline int karatsuba_calls = 0;  // counts the calls, to compare with the call tree

// x * y for x, y >= 0, with three recursive products per split instead of four.
inline long long karatsuba(long long x, long long y) {
  karatsuba_calls++;
  if (x < 10 || y < 10) return x * y;
  std::size_t m = std::max(std::to_string(x).size(), std::to_string(y).size()) / 2;
  long long p = 1;
  for (std::size_t i = 0; i < m; i++) p *= 10;
  long long a = x / p, b = x % p;  // x = a * 10^m + b
  long long c = y / p, d = y % p;  // y = c * 10^m + d
  long long z2 = karatsuba(a, c);
  long long z0 = karatsuba(b, d);
  long long z1 = karatsuba(a + b, c + d) - z2 - z0;  // = a*d + b*c
  return z2 * p * p + z1 * p + z0;
}
