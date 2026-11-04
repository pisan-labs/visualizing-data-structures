#pragma once
#include <vector>

// Returns the index of the first x in a, or -1 if x is not there.
inline int linear_search(const std::vector<int>& a, int x) {
  for (int i = 0; i < static_cast<int>(a.size()); i++) {
    if (a[i] == x) return i;
  }
  return -1;
}
