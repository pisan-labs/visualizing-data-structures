#pragma once
#include <cstddef>
#include <utility>
#include <vector>

// Gnome sort: one index walks forward past pairs in order and back after each swap.
inline void gnome_sort(std::vector<int>& a) {
  std::size_t pos = 0;
  while (pos < a.size()) {
    if (pos == 0 || a[pos - 1] <= a[pos]) {
      pos++;
    } else {
      std::swap(a[pos - 1], a[pos]);
      pos--;
    }
  }
}
