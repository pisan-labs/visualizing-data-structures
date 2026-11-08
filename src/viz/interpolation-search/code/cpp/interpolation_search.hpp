#pragma once
#include <vector>

// Interpolation search: guess where x is from its value, not from the middle.
// Returns an index of x in the sorted vector a, or -1 if x is not there.
inline int interpolation_search(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo <= hi && a[lo] <= x && x <= a[hi]) {
    if (a[lo] == a[hi]) return lo;  // the whole window is x; avoid dividing by 0
    // long long: (x - a[lo]) * (hi - lo) can overflow an int on big values.
    long long num = static_cast<long long>(x - a[lo]) * (hi - lo);
    int pos = lo + static_cast<int>(num / (a[hi] - a[lo]));
    if (a[pos] == x) return pos;
    if (a[pos] < x) {
      lo = pos + 1;
    } else {
      hi = pos - 1;
    }
  }
  return -1;
}
