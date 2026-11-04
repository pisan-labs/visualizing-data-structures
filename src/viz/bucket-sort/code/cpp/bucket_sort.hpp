#pragma once
#include <algorithm>
#include <cstddef>
#include <vector>

inline void insertion_sort(std::vector<double>& b) {
  for (std::size_t i = 1; i < b.size(); i++) {
    const double key = b[i];
    std::size_t j = i;
    while (j > 0 && b[j - 1] > key) {
      b[j] = b[j - 1];
      j--;
    }
    b[j] = key;
  }
}

// Bucket sort of values in [lo, hi): n buckets of equal width, insertion sort in each, then join.
inline void bucket_sort(std::vector<double>& a, double lo = 0.0, double hi = 1.0) {
  const int n = static_cast<int>(a.size());
  std::vector<std::vector<double>> buckets(n);
  for (double x : a) buckets[std::min(n - 1, static_cast<int>(n * (x - lo) / (hi - lo)))].push_back(x);
  a.clear();
  for (auto& bucket : buckets) {
    insertion_sort(bucket);
    a.insert(a.end(), bucket.begin(), bucket.end());
  }
}
