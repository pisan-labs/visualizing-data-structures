#pragma once
#include <cstddef>
#include <vector>

// Merges the sorted runs a[p..q] and a[q+1..r] into a[p..r].
inline void merge_runs(std::vector<int>& a, int p, int q, int r) {
  const std::vector<int> left(a.begin() + p, a.begin() + q + 1);
  const std::vector<int> right(a.begin() + q + 1, a.begin() + r + 1);
  std::size_t i = 0;
  std::size_t j = 0;
  int k = p;
  while (i < left.size() && j < right.size()) {
    if (left[i] <= right[j]) {
      a[k++] = left[i++];
    } else {
      a[k++] = right[j++];
    }
  }
  while (i < left.size()) a[k++] = left[i++];
  while (j < right.size()) a[k++] = right[j++];
}

// Merge sort, smallest first: sort each half, then merge the two sorted halves.
inline void merge_sort(std::vector<int>& a, int p, int r) {
  if (p >= r) return;
  const int q = (p + r) / 2;
  merge_sort(a, p, q);
  merge_sort(a, q + 1, r);
  merge_runs(a, p, q, r);
}

inline void merge_sort(std::vector<int>& a) {
  merge_sort(a, 0, static_cast<int>(a.size()) - 1);
}
