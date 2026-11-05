#pragma once
#include <algorithm>
#include <set>
#include <utility>
#include <vector>

// Cut vertices and bridges of an undirected graph, by Tarjan's low-link DFS. adj[u] lists u's
// neighbours in increasing order. cuts holds the cut vertices in increasing order; bridges holds
// each bridge as (parent, child), in the order DFS finds them.
class Bridges {
 public:
  explicit Bridges(const std::vector<std::vector<int>>& adj)
      : adj_(adj), d_(adj.size(), -1), low_(adj.size(), 0) {
    for (int u = 0; u < static_cast<int>(adj.size()); u++)
      if (d_[u] == -1 && visit(u, -1) >= 2) cuts.insert(u);  // the root rule
  }

  std::set<int> cuts;
  std::vector<std::pair<int, int>> bridges;

 private:
  const std::vector<std::vector<int>>& adj_;
  std::vector<int> d_, low_;
  int time_ = 0;

  // Returns the number of DFS children of u.
  int visit(int u, int p) {
    d_[u] = low_[u] = ++time_;
    int children = 0;
    for (int v : adj_[u]) {
      if (d_[v] == -1) {
        children++;
        visit(v, u);
        low_[u] = std::min(low_[u], low_[v]);
        if (low_[v] > d_[u]) bridges.emplace_back(u, v);
        if (p != -1 && low_[v] >= d_[u]) cuts.insert(u);
      } else if (v != p) {  // a back edge (the parent edge does not count)
        low_[u] = std::min(low_[u], d_[v]);
      }
    }
    return children;
  }
};
