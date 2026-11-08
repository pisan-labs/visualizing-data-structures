#pragma once
#include <cstddef>
#include <utility>
#include <vector>

// Comb sort: bubble sort with a gap that shrinks by a factor of 1.3 each pass.
inline void comb_sort(std::vector<int>& a) {
  std::size_t gap = a.size();
  bool done = false;
  while (!done) {
    gap = gap * 10 / 13;  // floor(gap / 1.3), in whole numbers
    if (gap <= 1) {
      gap = 1;
      done = true;  // unless this pass swaps something
    }
    for (std::size_t i = 0; i + gap < a.size(); i++) {
      if (a[i] > a[i + gap]) {
        std::swap(a[i], a[i + gap]);
        done = false;
      }
    }
  }
}
