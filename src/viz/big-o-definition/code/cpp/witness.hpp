// f(n) = O(g(n)) when 0 <= f(n) <= c * g(n) for every n >= n0, for some c > 0 and n0.
// A program can only try a finite range of n. These check a witness (c, n0) up to n_max and
// find the smallest n0 for a c. c = c_num / c_den, compared without dividing.
#pragma once

#include <functional>
#include <optional>

using Fn = std::function<long long(long long)>;

// The floor of log2 n: how many times n halves before it reaches 1.
inline long long lg(long long n) {
  long long k = 0;
  while (n > 1) {
    n /= 2;
    ++k;
  }
  return k;
}

inline bool holds(const Fn& f, const Fn& g, long long c_num, long long c_den, long long n) {
  long long fn = f(n);
  return fn >= 0 && fn * c_den <= c_num * g(n);
}

// The first n from n0 to n_max that breaks it, if any.
inline std::optional<long long> first_failure(const Fn& f, const Fn& g, long long c_num,
                                              long long c_den, long long n0, long long n_max) {
  for (long long n = n0; n <= n_max; ++n) {
    if (!holds(f, g, c_num, c_den, n)) return n;
  }
  return std::nullopt;
}

// The smallest n0 with nothing breaking it up to n_max: one past the last failure.
inline std::optional<long long> smallest_n0(const Fn& f, const Fn& g, long long c_num,
                                            long long c_den, long long n_max) {
  for (long long n = n_max; n >= 1; --n) {
    if (!holds(f, g, c_num, c_den, n)) {
      if (n == n_max) return std::nullopt;
      return n + 1;
    }
  }
  return 1;
}
