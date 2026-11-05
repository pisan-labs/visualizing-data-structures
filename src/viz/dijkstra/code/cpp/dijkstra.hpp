#pragma once
#include <functional>
#include <limits>
#include <queue>
#include <stdexcept>
#include <utility>
#include <vector>

// Dijkstra's shortest paths from s. adj[u] lists edges {v, w}, each with w >= 0.
const long long INF = std::numeric_limits<long long>::max();

struct Paths {
  std::vector<long long> d;  // INF when unreachable
  std::vector<int> pi;       // -1 when there is no parent (NIL)
};

inline Paths dijkstra(const std::vector<std::vector<std::pair<int, int>>>& adj, int s) {
  for (const auto& edges : adj)
    for (const auto& e : edges)
      if (e.second < 0) throw std::invalid_argument("Dijkstra needs weights of at least 0");
  int n = static_cast<int>(adj.size());
  Paths r{std::vector<long long>(n, INF), std::vector<int>(n, -1)};
  std::vector<bool> done(n, false);
  r.d[s] = 0;
  // A min-heap of {key, vertex}.
  using Entry = std::pair<long long, int>;
  std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> q;
  q.push({0, s});
  while (!q.empty()) {
    int u = q.top().second;
    q.pop();
    if (done[u]) continue;  // a stale entry: u was settled with a smaller key
    done[u] = true;
    for (auto [v, w] : adj[u]) {
      if (r.d[u] + w < r.d[v]) {
        r.d[v] = r.d[u] + w;
        r.pi[v] = u;
        q.push({r.d[v], v});
      }
    }
  }
  return r;
}
