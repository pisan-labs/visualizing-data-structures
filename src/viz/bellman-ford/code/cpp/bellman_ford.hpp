#pragma once
#include <algorithm>
#include <array>
#include <limits>
#include <vector>

// Bellman-Ford shortest paths from s, as in CLRS. Each edge is {u, v, w}, in relax order.
const long long INF = std::numeric_limits<long long>::max();

struct Paths {
  std::vector<long long> d;  // INF when unreachable
  std::vector<int> pi;       // -1 when there is no parent (NIL)
  std::vector<int> cycle;    // a negative cycle s can reach, in order; empty if none
};

inline Paths bellmanFord(int n, const std::vector<std::array<int, 3>>& edges, int s) {
  Paths r{std::vector<long long>(n, INF), std::vector<int>(n, -1), {}};
  r.d[s] = 0;
  for (int i = 1; i < n; i++)
    for (const auto& [u, v, w] : edges)
      if (r.d[u] != INF && r.d[u] + w < r.d[v]) {
        r.d[v] = r.d[u] + w;
        r.pi[v] = u;
      }
  for (const auto& [u, v, w] : edges) {
    if (r.d[u] != INF && r.d[u] + w < r.d[v]) {
      r.d[v] = r.d[u] + w;
      r.pi[v] = u;
      // Follow pi back from v until a vertex repeats: from there on it is the cycle.
      std::vector<int> walk;
      int x = v;
      while (std::find(walk.begin(), walk.end(), x) == walk.end()) {
        walk.push_back(x);
        x = r.pi[x];
      }
      r.cycle.assign(std::find(walk.begin(), walk.end(), x), walk.end());
      std::reverse(r.cycle.begin(), r.cycle.end());
      return r;
    }
  }
  return r;
}
