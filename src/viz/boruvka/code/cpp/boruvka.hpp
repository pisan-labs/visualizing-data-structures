#pragma once
#include <algorithm>
#include <array>
#include <map>
#include <vector>

struct Forest {
  int total = 0;
  std::vector<int> tree;  // edge indexes, in the order they joined
};

// Label each vertex with the smallest vertex of its piece of the tree so far.
inline std::vector<int> components(int n, const std::vector<std::array<int, 3>>& edges,
                                   const std::vector<int>& tree) {
  std::vector<std::vector<int>> adj(n);
  for (int i : tree) {
    adj[edges[i][0]].push_back(edges[i][1]);
    adj[edges[i][1]].push_back(edges[i][0]);
  }
  std::vector<int> comp(n, -1);
  for (int s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    comp[s] = s;
    std::vector<int> stack = {s};
    while (!stack.empty()) {
      int u = stack.back();
      stack.pop_back();
      for (int w : adj[u])
        if (comp[w] < 0) {
          comp[w] = s;
          stack.push_back(w);
        }
    }
  }
  return comp;
}

// Boruvka's minimum spanning tree (a forest if the graph is not connected).
// edges[i] = {u, v, w}. Ties go to the edge earlier in the list.
inline Forest boruvka(int n, const std::vector<std::array<int, 3>>& edges) {
  Forest f;
  while (true) {
    std::vector<int> comp = components(n, edges, f.tree);
    std::map<int, int> cheapest;  // component -> index of its cheapest edge out
    for (int i = 0; i < static_cast<int>(edges.size()); i++) {
      auto [u, v, w] = edges[i];
      if (comp[u] == comp[v]) continue;
      for (int c : {comp[u], comp[v]}) {
        auto it = cheapest.find(c);
        if (it == cheapest.end() || w < edges[it->second][2]) cheapest[c] = i;
      }
    }
    if (cheapest.empty()) break;
    for (auto [c, i] : cheapest) {
      if (std::find(f.tree.begin(), f.tree.end(), i) == f.tree.end()) {  // both ends may pick it
        f.tree.push_back(i);
        f.total += edges[i][2];
      }
    }
  }
  return f;
}
