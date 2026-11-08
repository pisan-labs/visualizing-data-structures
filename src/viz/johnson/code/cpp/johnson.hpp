#pragma once
#include <array>
#include <climits>
#include <functional>
#include <optional>
#include <queue>
#include <utility>
#include <vector>

constexpr long long INF = LLONG_MAX;

// Johnson's all-pairs shortest paths. arcs[i] = {u, v, w}. Returns dist[s][t]
// (INF for no path), or nothing when there is a negative cycle.
inline std::optional<std::vector<std::vector<long long>>> johnson(
    int n, const std::vector<std::array<int, 3>>& arcs) {
  // Bellman-Ford from a new vertex q with a 0 arc to every vertex: h starts at 0.
  std::vector<long long> h(n, 0);
  for (int pass = 0; pass < n; pass++) {
    bool changed = false;
    for (auto [u, v, w] : arcs)
      if (h[u] + w < h[v]) {
        h[v] = h[u] + w;
        changed = true;
      }
    if (!changed) break;
  }
  for (auto [u, v, w] : arcs)
    if (h[u] + w < h[v]) return std::nullopt;  // negative cycle

  std::vector<std::vector<std::pair<int, long long>>> out(n);  // w' = w + h(u) - h(v) >= 0
  for (auto [u, v, w] : arcs) out[u].push_back({v, w + h[u] - h[v]});
  std::vector<std::vector<long long>> dist(n, std::vector<long long>(n, INF));
  for (int s = 0; s < n; s++) {
    std::vector<long long> d(n, INF);
    d[s] = 0;
    using Item = std::pair<long long, int>;
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
    pq.push({0, s});
    while (!pq.empty()) {
      auto [du, u] = pq.top();
      pq.pop();
      if (du > d[u]) continue;  // stale entry
      for (auto [v, w] : out[u])
        if (du + w < d[v]) {
          d[v] = du + w;
          pq.push({d[v], v});
        }
    }
    for (int t = 0; t < n; t++)
      if (d[t] != INF) dist[s][t] = d[t] - h[s] + h[t];
  }
  return dist;
}
