#pragma once
#include <algorithm>
#include <climits>
#include <vector>

// Cheapest assignment of n rows to n columns: the Hungarian algorithm with
// potentials. Returns mate, where mate[i] is the column given to row i.
inline std::vector<int> hungarian(const std::vector<std::vector<int>>& cost) {
  const int n = static_cast<int>(cost.size());
  std::vector<int> u(n), v(n, INT_MAX);
  for (int i = 0; i < n; i++) u[i] = *std::min_element(cost[i].begin(), cost[i].end());
  for (int j = 0; j < n; j++)
    for (int i = 0; i < n; i++) v[j] = std::min(v[j], cost[i][j] - u[i]);
  std::vector<int> row_mate(n, -1), col_mate(n, -1);

  for (int root = 0; root < n; root++) {
    std::vector<int> tree_rows{root};     // S
    std::vector<bool> in_tree(n, false);  // T
    std::vector<int> prev(n, -1);         // the row that reached column j
    int free = -1;
    while (free == -1) {
      for (size_t q = 0; q < tree_rows.size() && free == -1; q++) {
        const int i = tree_rows[q];
        for (int j = 0; j < n && free == -1; j++) {
          if (in_tree[j] || cost[i][j] - u[i] - v[j] != 0) continue;
          in_tree[j] = true;
          prev[j] = i;
          if (col_mate[j] == -1) free = j;
          else tree_rows.push_back(col_mate[j]);
        }
      }
      if (free != -1) break;
      int delta = INT_MAX;  // stuck: make a new tight cell
      for (int i : tree_rows)
        for (int j = 0; j < n; j++)
          if (!in_tree[j]) delta = std::min(delta, cost[i][j] - u[i] - v[j]);
      for (int i : tree_rows) u[i] += delta;
      for (int j = 0; j < n; j++)
        if (in_tree[j]) v[j] -= delta;
    }
    for (int j = free; j != -1;) {  // flip the augmenting path
      const int i = prev[j], next = row_mate[i];
      row_mate[i] = j;
      col_mate[j] = i;
      j = next;
    }
  }
  return row_mate;
}

// To maximize, minimize M - cost, where M is the largest entry.
inline std::vector<int> best_assignment(std::vector<std::vector<int>> cost, bool maximize) {
  if (maximize) {
    int big = INT_MIN;
    for (const auto& row : cost) big = std::max(big, *std::max_element(row.begin(), row.end()));
    for (auto& row : cost)
      for (int& c : row) c = big - c;
  }
  return hungarian(cost);
}
