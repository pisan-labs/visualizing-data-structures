#pragma once
#include <algorithm>
#include <limits>
#include <vector>

// Tours of cities 0..n-1 that start at 0. d[i][j] is the distance from i to j.
using Matrix = std::vector<std::vector<int>>;
constexpr long long INF = std::numeric_limits<long long>::max() / 4;

// Held-Karp: the length of the shortest tour. O(2^n n^2) time.
inline long long heldKarp(const Matrix& d) {
  int n = static_cast<int>(d.size());
  if (n == 1) return 0;
  int m = n - 1;  // bit j of a set S stands for city j + 1
  // c[S][j]: the shortest path from 0 through every city of S, ending at j.
  std::vector<std::vector<long long>> c(1 << m, std::vector<long long>(m, INF));
  for (int j = 0; j < m; j++) c[1 << j][j] = d[0][j + 1];
  for (int s = 1; s < (1 << m); s++) {
    for (int j = 0; j < m; j++) {
      if (!(s >> j & 1) || s == 1 << j) continue;
      int prev = s ^ (1 << j);
      for (int k = 0; k < m; k++)
        if (prev >> k & 1) c[s][j] = std::min(c[s][j], c[prev][k] + d[k + 1][j + 1]);
    }
  }
  long long best = INF;
  for (int j = 0; j < m; j++) best = std::min(best, c[(1 << m) - 1][j] + d[j + 1][0]);
  return best;
}

inline void preorder(int u, const std::vector<std::vector<int>>& children, std::vector<int>& tour) {
  tour.push_back(u);
  for (int c : children[u]) preorder(c, children, tour);
}

// CLRS's APPROX-TSP-TOUR: a minimum spanning tree from city 0 (Prim with an array), then the
// cities in preorder. With the triangle inequality, at most twice the optimum.
inline std::vector<int> approxTour(const Matrix& d) {
  int n = static_cast<int>(d.size());
  std::vector<long long> key(n, INF);
  std::vector<int> parent(n, -1);
  std::vector<bool> inTree(n, false);
  key[0] = 0;
  for (int round = 0; round < n; round++) {
    int u = -1;
    for (int v = 0; v < n; v++)
      if (!inTree[v] && (u < 0 || key[v] < key[u])) u = v;
    inTree[u] = true;
    for (int v = 0; v < n; v++) {
      if (!inTree[v] && d[u][v] < key[v]) {
        key[v] = d[u][v];
        parent[v] = u;
      }
    }
  }
  std::vector<std::vector<int>> children(n);
  for (int v = 1; v < n; v++) children[parent[v]].push_back(v);
  std::vector<int> tour;
  preorder(0, children, tour);
  return tour;
}

inline long long tourLength(const Matrix& d, const std::vector<int>& tour) {
  int n = static_cast<int>(tour.size());
  long long total = 0;
  if (n > 1)
    for (int i = 0; i < n; i++) total += d[tour[i]][tour[(i + 1) % n]];
  return total;
}
