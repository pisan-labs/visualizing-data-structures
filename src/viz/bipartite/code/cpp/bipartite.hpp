#pragma once
#include <algorithm>
#include <queue>
#include <vector>

// Two-colors an undirected graph with breadth-first search. adj[u] lists u's neighbours in
// order. Either ok is true and side holds 0 or 1 for every vertex, or ok is false and cycle
// is an odd cycle that proves no split exists.
struct BipartiteResult {
  bool ok = true;
  std::vector<int> side;
  std::vector<int> cycle;
};

// Up from u to where the tree paths meet, then down to v.
inline std::vector<int> oddCycle(const std::vector<int>& parent, int u, int v) {
  std::vector<int> up, vp;
  for (int x = u; x != -1; x = parent[x]) up.push_back(x);
  for (int x = v; x != -1; x = parent[x]) vp.push_back(x);
  auto meet = std::find_first_of(vp.begin(), vp.end(), up.begin(), up.end());
  std::vector<int> cycle(up.begin(), std::find(up.begin(), up.end(), *meet) + 1);
  cycle.insert(cycle.end(), std::make_reverse_iterator(meet), vp.rend());
  return cycle;
}

inline BipartiteResult bipartite(const std::vector<std::vector<int>>& adj) {
  int n = static_cast<int>(adj.size());
  BipartiteResult r{true, std::vector<int>(n, -1), {}};
  std::vector<int> parent(n, -1);
  for (int s = 0; s < n; s++) {
    if (r.side[s] != -1) continue;
    r.side[s] = 0;
    std::queue<int> q;
    q.push(s);
    while (!q.empty()) {
      int u = q.front();
      q.pop();
      for (int v : adj[u]) {
        if (r.side[v] == -1) {
          r.side[v] = 1 - r.side[u];
          parent[v] = u;
          q.push(v);
        } else if (r.side[v] == r.side[u]) {
          r.ok = false;
          r.cycle = oddCycle(parent, u, v);
          return r;
        }
      }
    }
  }
  return r;
}
