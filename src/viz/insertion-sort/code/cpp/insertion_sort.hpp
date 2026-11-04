#pragma once
#include <vector>

// Insertion sort, smallest first. a[0..i-1] is always sorted. Take key = a[i],
// shift the larger values in the sorted part one slot right, and drop key into
// the gap.
inline void insertion_sort(std::vector<int>& a) {
  const int n = static_cast<int>(a.size());
  for (int i = 1; i < n; i++) {
    const int key = a[i];
    int j = i - 1;
    while (j >= 0 && a[j] > key) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = key;
  }
}
