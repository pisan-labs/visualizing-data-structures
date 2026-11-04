#pragma once
#include <utility>
#include <vector>

// Bubble sort, smallest first. Each pass walks j from the back to the front and
// swaps neighbors that are out of order, so after pass i the i + 1 smallest
// values are in a[0..i].
inline void bubble_sort(std::vector<int>& a) {
  const int n = static_cast<int>(a.size());
  for (int i = 0; i < n - 1; i++) {
    for (int j = n - 1; j > i; j--) {
      if (a[j] < a[j - 1]) {
        std::swap(a[j], a[j - 1]);
      }
    }
  }
}
