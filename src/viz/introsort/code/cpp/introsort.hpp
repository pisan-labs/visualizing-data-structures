#pragma once
#include <utility>
#include <vector>

// Introsort: quicksort with a depth budget of 2 * floor(log2 n). Heap sort takes over a part
// when the budget runs out, and insertion sort finishes small parts. std::sort works this way.

namespace introsort_detail {

constexpr int kSmall = 3;  // libraries use 16

inline void insertion_sort(std::vector<int>& a, int p, int r) {
  for (int i = p + 1; i <= r; i++)
    for (int j = i; j > p && a[j - 1] > a[j]; j--) std::swap(a[j - 1], a[j]);
}

inline void sift_down(std::vector<int>& a, int p, int i, int size) {
  while (2 * i + 1 < size) {
    int big = 2 * i + 1;
    if (big + 1 < size && a[p + big + 1] > a[p + big]) big++;
    if (a[p + big] <= a[p + i]) return;
    std::swap(a[p + i], a[p + big]);
    i = big;
  }
}

inline void heap_sort(std::vector<int>& a, int p, int r) {
  int n = r - p + 1;
  for (int i = n / 2 - 1; i >= 0; i--) sift_down(a, p, i, n);
  for (int end = n - 1; end > 0; end--) {
    std::swap(a[p], a[p + end]);
    sift_down(a, p, 0, end);
  }
}

// Lomuto's partition around the median of a[p], a[mid] and a[r].
inline int partition(std::vector<int>& a, int p, int r) {
  int idx[3] = {p, (p + r) / 2, r};
  for (int s = 1; s < 3; s++)
    for (int t = s; t > 0 && a[idx[t - 1]] > a[idx[t]]; t--) std::swap(idx[t], idx[t - 1]);
  std::swap(a[idx[1]], a[r]);
  int x = a[r];
  int i = p - 1;
  for (int j = p; j < r; j++)
    if (a[j] <= x) std::swap(a[++i], a[j]);
  std::swap(a[i + 1], a[r]);
  return i + 1;
}

inline void loop(std::vector<int>& a, int p, int r, int limit) {
  if (r - p + 1 <= kSmall) {
    insertion_sort(a, p, r);
  } else if (limit == 0) {
    heap_sort(a, p, r);
  } else {
    int q = partition(a, p, r);
    loop(a, p, q - 1, limit - 1);
    loop(a, q + 1, r, limit - 1);
  }
}

}  // namespace introsort_detail

inline void introsort(std::vector<int>& a) {
  int n = static_cast<int>(a.size());
  if (n < 2) return;
  int log2n = 0;
  while ((2 << log2n) <= n) log2n++;
  introsort_detail::loop(a, 0, n - 1, 2 * log2n);
}
