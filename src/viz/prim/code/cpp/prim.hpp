#pragma once
#include <functional>
#include <limits>
#include <queue>
#include <utility>
#include <vector>

// Prim's minimum spanning tree (a forest if the graph is not connected), from r.
// adj[u] lists edges {v, w} of an undirected graph.
struct Tree {
  long long total = 0;  // the weight of the tree
  std::vector<int> pi;  // the parent of each vertex, -1 for a root (NIL)
};

inline Tree prim(const std::vector<std::vector<std::pair<int, int>>>& adj, int r) {
  int n = static_cast<int>(adj.size());
  Tree t{0, std::vector<int>(n, -1)};
  std::vector<long long> key(n, std::numeric_limits<long long>::max());
  std::vector<bool> inTree(n, false);
  // A min-heap of {key, vertex}.
  using Entry = std::pair<long long, int>;
  std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> q;
  for (int i = -1; i < n; i++) {
    int root = i < 0 ? r : i;  // a new tree for each piece
    if (inTree[root]) continue;
    q.push({0, root});
    while (!q.empty()) {
      auto [k, u] = q.top();
      q.pop();
      if (inTree[u]) continue;  // a stale entry
      inTree[u] = true;
      if (t.pi[u] >= 0) t.total += k;
      for (auto [v, w] : adj[u]) {
        if (!inTree[v] && w < key[v]) {
          key[v] = w;
          t.pi[v] = u;
          q.push({w, v});
        }
      }
    }
  }
  return t;
}
