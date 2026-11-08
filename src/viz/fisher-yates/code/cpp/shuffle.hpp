#pragma once
#include <utility>
#include <vector>

// Shuffle a in place (Fisher-Yates). rand_int(lo, hi) returns a random int in [lo, hi].
template <typename T, typename RandInt>
void shuffle(std::vector<T>& a, RandInt rand_int) {
  int n = static_cast<int>(a.size());
  for (int i = 0; i < n - 1; i++) {
    int j = rand_int(i, n - 1);  // from the unshuffled part, i included
    std::swap(a[i], a[j]);
  }
}
