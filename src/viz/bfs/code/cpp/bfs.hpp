#pragma once
#include <queue>
#include <vector>

// Breadth-first search from s, as in CLRS. adj[u] lists u's neighbours in order.
struct BfsResult {
  std::vector<int> order;  // the order vertices are dequeued
  std::vector<int> d;      // -1 when unreachable (infinity)
  std::vector<int> pi;     // -1 when there is no parent (NIL)
};

inline BfsResult bfs(const std::vector<std::vector<int>>& adj, int s) {
  enum Color { WHITE, GRAY, BLACK };
  int n = static_cast<int>(adj.size());
  std::vector<Color> color(n, WHITE);
  BfsResult r{{}, std::vector<int>(n, -1), std::vector<int>(n, -1)};
  color[s] = GRAY;
  r.d[s] = 0;
  std::queue<int> q;
  q.push(s);
  while (!q.empty()) {
    int u = q.front();
    q.pop();
    r.order.push_back(u);
    for (int v : adj[u]) {
      if (color[v] == WHITE) {
        color[v] = GRAY;
        r.d[v] = r.d[u] + 1;
        r.pi[v] = u;
        q.push(v);
      }
    }
    color[u] = BLACK;
  }
  return r;
}
