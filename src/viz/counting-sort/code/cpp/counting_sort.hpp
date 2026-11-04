#pragma once
#include <algorithm>
#include <vector>

// Counting sort for whole numbers from 0 to k: count, add up, then place from the right.
inline void counting_sort(std::vector<int>& a) {
  if (a.empty()) return;
  const int k = *std::max_element(a.begin(), a.end());
  std::vector<int> count(k + 1, 0);
  for (int x : a) count[x]++;
  for (int i = 1; i <= k; i++) count[i] += count[i - 1];  // how many values are <= i
  std::vector<int> out(a.size());
  for (auto it = a.rbegin(); it != a.rend(); ++it) out[--count[*it]] = *it;  // stable
  a = out;
}
