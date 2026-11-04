#pragma once
#include <algorithm>
#include <vector>

// LSD radix sort of whole numbers >= 0: one stable pass per digit, last digit first.
inline void radix_sort(std::vector<int>& a, int base = 10) {
  if (a.empty()) return;
  const long long largest = *std::max_element(a.begin(), a.end());
  for (long long place = 1;; place *= base) {
    std::vector<std::vector<int>> buckets(base);
    for (int x : a) buckets[x / place % base].push_back(x);  // to the back: stable
    a.clear();
    for (const auto& bucket : buckets) a.insert(a.end(), bucket.begin(), bucket.end());
    if (largest < place * base) return;
  }
}
