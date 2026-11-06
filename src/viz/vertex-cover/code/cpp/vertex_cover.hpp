#pragma once
#include <utility>
#include <vector>

// Vertex covers of an undirected graph on vertices 0..n-1; edges are {u, v} pairs.
using Edges = std::vector<std::pair<int, int>>;

// CLRS's APPROX-VERTEX-COVER: take an edge with neither end in the cover and add both ends.
// The edges taken share no vertex, and any cover needs one end of each, so the cover is at
// most twice the smallest.
inline std::vector<int> approxVertexCover(int n, const Edges& edges) {
  std::vector<int> cover;
  std::vector<bool> taken(n, false);
  for (auto [u, v] : edges) {
    if (!taken[u] && !taken[v]) {
      cover.push_back(u);
      cover.push_back(v);
      taken[u] = taken[v] = true;
    }
  }
  return cover;
}

// Brute force over all 2^n sets of vertices: the size of a smallest cover.
inline int minCoverSize(int n, const Edges& edges) {
  int best = n;
  for (int mask = 0; mask < (1 << n); mask++) {
    int k = __builtin_popcount(mask);
    if (k >= best) continue;
    bool ok = true;
    for (auto [u, v] : edges)
      if (!(mask >> u & 1) && !(mask >> v & 1)) ok = false;
    if (ok) best = k;
  }
  return best;
}
