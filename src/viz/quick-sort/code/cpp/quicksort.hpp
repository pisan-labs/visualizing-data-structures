#pragma once
#include <utility>
#include <vector>

// Lomuto's partition around the last value. Returns where the pivot lands:
// everything left of it is <= it, everything right of it is bigger.
inline int partition(std::vector<int>& a, int p, int r) {
  const int x = a[r];
  int i = p - 1;
  for (int j = p; j < r; j++) {
    if (a[j] <= x) {
      i++;
      std::swap(a[i], a[j]);
    }
  }
  std::swap(a[i + 1], a[r]);
  return i + 1;
}

// Quicksort, smallest first.
inline void quicksort(std::vector<int>& a, int p, int r) {
  if (p < r) {
    const int q = partition(a, p, r);
    quicksort(a, p, q - 1);
    quicksort(a, q + 1, r);
  }
}

inline void quicksort(std::vector<int>& a) {
  quicksort(a, 0, static_cast<int>(a.size()) - 1);
}
