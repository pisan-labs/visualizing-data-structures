#pragma once
#include <algorithm>
#include <vector>

// Exponential search: jump 1, 2, 4, 8, ... slots, then binary search the last jump.
// Returns an index of x in the sorted vector a, or -1 if x is not there.
inline int exponential_search(const std::vector<int>& a, int x) {
  int n = static_cast<int>(a.size());
  int bound = 1;
  while (bound < n && a[bound] < x) bound *= 2;
  int lo = bound / 2;
  int hi = std::min(bound, n - 1);
  while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == x) return mid;
    if (a[mid] > x) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return -1;
}
