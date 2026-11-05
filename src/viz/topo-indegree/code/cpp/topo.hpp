#pragma once
#include <queue>
#include <vector>

// Kahn's algorithm: repeatedly take a vertex with no arcs left coming in. adj[u] lists the
// heads of u's arcs in order. If the graph has a cycle, the vertices on it (and after it)
// never become ready, and the order is shorter than the number of vertices.
inline std::vector<int> topologicalSort(const std::vector<std::vector<int>>& adj) {
  int n = static_cast<int>(adj.size());
  std::vector<int> indegree(n, 0);
  for (const auto& heads : adj)
    for (int v : heads) indegree[v]++;
  std::queue<int> q;
  for (int v = 0; v < n; v++)
    if (indegree[v] == 0) q.push(v);
  std::vector<int> order;
  while (!q.empty()) {
    int u = q.front();
    q.pop();
    order.push_back(u);
    for (int v : adj[u]) {
      if (--indegree[v] == 0) q.push(v);
    }
  }
  return order;
}
