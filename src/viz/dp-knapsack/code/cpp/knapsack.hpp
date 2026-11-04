#pragma once
#include <algorithm>
#include <cstddef>
#include <utility>
#include <vector>

// An item: (weight, value). Each goes in whole or not at all.
using Item = std::pair<int, int>;

// best[i][c] is the best value from the first i items with capacity c.
inline std::vector<std::vector<int>> knapsack_table(const std::vector<Item>& items, int capacity) {
  const std::size_t n = items.size();
  std::vector<std::vector<int>> best(n + 1, std::vector<int>(capacity + 1, 0));
  for (std::size_t i = 1; i <= n; i++) {
    const auto [w, v] = items[i - 1];
    for (int c = 0; c <= capacity; c++) {
      best[i][c] = best[i - 1][c];  // skip item i
      if (w <= c && best[i - 1][c - w] + v > best[i][c]) best[i][c] = best[i - 1][c - w] + v;
    }
  }
  return best;
}

// The numbers (from 1) of the items in one best knapsack.
inline std::vector<int> knapsack_items(const std::vector<Item>& items, int capacity) {
  const auto best = knapsack_table(items, capacity);
  std::vector<int> taken;
  int c = capacity;
  for (std::size_t i = items.size(); i >= 1; i--) {
    if (best[i][c] != best[i - 1][c]) {
      taken.push_back(static_cast<int>(i));
      c -= items[i - 1].first;
    }
  }
  std::reverse(taken.begin(), taken.end());
  return taken;
}
