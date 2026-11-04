#pragma once
#include <random>
#include <utility>
#include <vector>

// Lomuto's partition around a[r]. Returns where the pivot lands.
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

// Swap a random value to the end, then partition around it.
inline int randomized_partition(std::vector<int>& a, int p, int r) {
  static std::mt19937 gen(std::random_device{}());
  std::uniform_int_distribution<int> pick(p, r);
  std::swap(a[pick(gen)], a[r]);
  return partition(a, p, r);
}

// Returns the k-th smallest value in a[p..r] (k = 1 for the smallest).
// The answer belongs in a[k - 1]. Reorders a as it goes.
inline int quickselect(std::vector<int>& a, int k, int p, int r) {
  if (p == r) return a[p];
  const int q = randomized_partition(a, p, r);
  if (k - 1 == q) return a[q];
  if (k - 1 < q) return quickselect(a, k, p, q - 1);
  return quickselect(a, k, q + 1, r);
}

inline int quickselect(std::vector<int>& a, int k) {
  return quickselect(a, k, 0, static_cast<int>(a.size()) - 1);
}
