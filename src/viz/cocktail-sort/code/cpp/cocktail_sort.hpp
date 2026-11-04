#pragma once
#include <utility>
#include <vector>

// Cocktail shaker sort, smallest first. Passes alternate direction: a forward
// pass carries the largest value in a[lo..hi] to a[hi], a backward pass carries
// the smallest to a[lo]. A pass with no swaps means the array is sorted.
inline void cocktail_sort(std::vector<int>& a) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo < hi) {
    bool swapped = false;
    for (int j = lo; j < hi; j++) {
      if (a[j] > a[j + 1]) {
        std::swap(a[j], a[j + 1]);
        swapped = true;
      }
    }
    hi--;
    if (!swapped) return;
    swapped = false;
    for (int j = hi; j > lo; j--) {
      if (a[j] < a[j - 1]) {
        std::swap(a[j], a[j - 1]);
        swapped = true;
      }
    }
    lo++;
    if (!swapped) return;
  }
}
