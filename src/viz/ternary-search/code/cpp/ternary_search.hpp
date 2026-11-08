#pragma once
#include <vector>

// Ternary search: look at two points and keep one third of the window.

// Returns an index of x in the sorted vector a, or -1 if x is not there.
inline int ternary_search(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo <= hi) {
    int third = (hi - lo) / 3;
    int m1 = lo + third;
    int m2 = hi - third;
    if (a[m1] == x) return m1;
    if (a[m2] == x) return m2;
    if (x < a[m1]) {
      hi = m1 - 1;
    } else if (x > a[m2]) {
      lo = m2 + 1;
    } else {
      lo = m1 + 1;
      hi = m2 - 1;
    }
  }
  return -1;
}

// Returns the index of the peak of a, which rises and then falls (-1 if a is empty).
inline int ternary_max(const std::vector<int>& a) {
  if (a.empty()) return -1;
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo < hi) {
    int third = (hi - lo) / 3;
    int m1 = lo + third;
    int m2 = hi - third;
    if (a[m1] < a[m2]) {
      lo = m1 + 1;  // still climbing: the peak is right of m1
    } else {
      hi = m2 - 1;  // falling: the peak is left of m2
    }
  }
  return lo;
}
