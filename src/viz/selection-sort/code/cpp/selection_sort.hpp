#pragma once
#include <utility>
#include <vector>

// Selection sort, smallest first. Pass i finds the smallest value in a[i..n-1]
// and swaps it into a[i], so after pass i the i + 1 smallest values are in
// their final places.
inline void selection_sort(std::vector<int>& a) {
  const int n = static_cast<int>(a.size());
  for (int i = 0; i < n - 1; i++) {
    int smallest = i;
    for (int j = i + 1; j < n; j++) {
      if (a[j] < a[smallest]) {
        smallest = j;
      }
    }
    std::swap(a[i], a[smallest]);
  }
}
