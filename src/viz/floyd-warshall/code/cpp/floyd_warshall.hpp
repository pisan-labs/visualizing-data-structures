#pragma once
#include <array>
#include <limits>
#include <vector>

// Shortest paths between every pair, as in CLRS, updating one matrix in place.
const long long INF = std::numeric_limits<long long>::max();

struct AllPairs {
  std::vector<std::vector<long long>> d;  // INF when there is no path; d[v][v] < 0: negative cycle
  std::vector<std::vector<int>> pi;       // the vertex just before j on a path from i, or -1
};

// Each edge is {u, v, w}.
inline AllPairs floydWarshall(int n, const std::vector<std::array<int, 3>>& edges) {
  AllPairs r{std::vector<std::vector<long long>>(n, std::vector<long long>(n, INF)),
             std::vector<std::vector<int>>(n, std::vector<int>(n, -1))};
  for (int i = 0; i < n; i++) r.d[i][i] = 0;
  for (const auto& [u, v, w] : edges) {
    r.d[u][v] = w;
    r.pi[u][v] = u;
  }
  for (int k = 0; k < n; k++)
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++) {
        if (r.d[i][k] == INF || r.d[k][j] == INF) continue;
        if (r.d[i][k] + r.d[k][j] < r.d[i][j]) {
          r.d[i][j] = r.d[i][k] + r.d[k][j];
          r.pi[i][j] = r.pi[k][j];
        }
      }
  return r;
}

// The vertices of a shortest path from i to j, read backwards from j.
inline std::vector<int> path(const AllPairs& r, int i, int j) {
  std::vector<int> p{j};
  while (p.front() != i) p.insert(p.begin(), r.pi[i][p.front()]);
  return p;
}
