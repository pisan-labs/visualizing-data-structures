#pragma once
#include <vector>

// A uniform sample of k items from a stream of unknown length (Algorithm R).
// rand_int(lo, hi) returns a random int in [lo, hi].
template <typename T, typename RandInt>
std::vector<T> reservoir_sample(const std::vector<T>& stream, int k, RandInt rand_int) {
  std::vector<T> reservoir;
  int i = 0;
  for (const T& item : stream) {
    i++;
    if (i <= k) {
      reservoir.push_back(item);  // the first k go straight in
    } else {
      int j = rand_int(1, i);
      if (j <= k) reservoir[j - 1] = item;  // probability k / i
    }
  }
  return reservoir;
}
