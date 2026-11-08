#pragma once
#include <set>
#include <vector>

// Greedy coloring: vertices 0..n-1 in order, each gets the smallest color
// (from 1) that none of its neighbours has. adj[v] lists v's neighbours.
inline std::vector<int> greedyColor(const std::vector<std::vector<int>>& adj) {
  std::vector<int> color(adj.size(), 0);
  for (std::size_t v = 0; v < adj.size(); v++) {
    std::set<int> used;
    for (int u : adj[v]) used.insert(color[u]);
    int c = 1;
    while (used.count(c)) c++;
    color[v] = c;
  }
  return color;
}
