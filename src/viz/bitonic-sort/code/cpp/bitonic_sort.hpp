#pragma once
#include <cstddef>
#include <stdexcept>
#include <utility>
#include <vector>

// A bitonic sorting network. The comparators do not depend on the values, so each inner loop
// over i could run all at once in parallel. a.size() must be a power of two.
inline void bitonic_sort(std::vector<int>& a) {
  std::size_t n = a.size();
  if ((n & (n - 1)) != 0) throw std::invalid_argument("n must be a power of two");
  auto compare = [&a](std::size_t i, std::size_t j) {
    if (j > i && a[i] > a[j]) std::swap(a[i], a[j]);  // smaller value to the lower index
  };
  for (std::size_t size = 2; size <= n; size *= 2) {
    // Flip: each value in the first half of a block meets its mirror.
    for (std::size_t i = 0; i < n; i++) compare(i, i ^ (size - 1));
    // Half-cleaners: compare values d apart, d = size/4, ..., 1.
    for (std::size_t d = size / 4; d >= 1; d /= 2)
      for (std::size_t i = 0; i < n; i++) compare(i, i ^ d);
  }
}
