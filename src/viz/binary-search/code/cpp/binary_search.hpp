#pragma once
#include <vector>

// Binary search on a sorted vector: look at the middle, throw away half.
// The standard library has std::lower_bound, std::upper_bound and
// std::binary_search (which only says whether x is there).

// Returns an index of x in a, or -1 if x is not there.
inline int search(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;  // (lo + hi) / 2 can overflow
    if (a[mid] == x) {
      return mid;
    } else if (a[mid] > x) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return -1;
}

// Returns the index of the first x in a, or -1.
inline int first(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  int r = -1;
  while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == x) {
      r = mid;  // remember it, keep looking left
      hi = mid - 1;
    } else if (a[mid] > x) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return r;
}

// Returns the index of the first value >= x, or a.size() if there is none.
inline int lower_bound_index(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size());  // the window is a[lo..hi-1]
  while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] >= x) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

// Returns the index of the first value > x, or a.size() if there is none.
inline int upper_bound_index(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size());
  while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] > x) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

// Returns an index of x, or -(insertion point) - 1 if x is not there.
inline int locate(const std::vector<int>& a, int x) {
  int lo = 0;
  int hi = static_cast<int>(a.size()) - 1;
  while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == x) {
      return mid;
    } else if (a[mid] > x) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return -(lo + 1);  // x would go at index lo
}
