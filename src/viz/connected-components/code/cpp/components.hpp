#pragma once
#include <queue>
#include <vector>

// Connected components of an undirected graph, numbered from 1. adj[u] lists u's
// neighbours in order. Each vertex without a number starts a breadth-first search.
struct Components {
  int count = 0;
  std::vector<int> cc;  // the component of each vertex; 0 is NIL
};

inline Components connectedComponents(const std::vector<std::vector<int>>& adj) {
  int n = static_cast<int>(adj.size());
  Components r{0, std::vector<int>(n, 0)};
  for (int s = 0; s < n; s++) {
    if (r.cc[s] != 0) continue;
    r.count++;
    r.cc[s] = r.count;
    std::queue<int> q;
    q.push(s);
    while (!q.empty()) {
      int u = q.front();
      q.pop();
      for (int v : adj[u]) {
        if (r.cc[v] == 0) {
          r.cc[v] = r.count;
          q.push(v);
        }
      }
    }
  }
  return r;
}
