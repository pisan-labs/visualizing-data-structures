#pragma once
#include <algorithm>
#include <array>
#include <numeric>
#include <tuple>
#include <utility>
#include <vector>

// Kruskal's minimum spanning tree (a forest if the graph is not connected).
// edges lists {u, v, w} for vertices 0..n-1.
struct Forest {
  long long total = 0;                    // the weight of the tree
  std::vector<std::pair<int, int>> tree;  // tree edges, in the order added
};

class UnionFind {
 public:
  explicit UnionFind(int n) : parent_(n), rank_(n, 0) {
    std::iota(parent_.begin(), parent_.end(), 0);
  }
  int find(int x) {
    if (parent_[x] != x) parent_[x] = find(parent_[x]);  // path compression
    return parent_[x];
  }
  void link(int a, int b) {  // union by rank, of two roots
    if (rank_[a] > rank_[b]) {
      parent_[b] = a;
    } else {
      parent_[a] = b;
      if (rank_[a] == rank_[b]) rank_[b]++;
    }
  }

 private:
  std::vector<int> parent_, rank_;
};

inline Forest kruskal(int n, std::vector<std::array<int, 3>> edges) {
  std::sort(edges.begin(), edges.end(), [](const auto& x, const auto& y) {
    return std::make_tuple(x[2], x[0], x[1]) < std::make_tuple(y[2], y[0], y[1]);
  });
  UnionFind uf(n);
  Forest f;
  for (const auto& [u, v, w] : edges) {
    int a = uf.find(u), b = uf.find(v);
    if (a == b) continue;  // u-v would close a cycle
    f.tree.push_back({u, v});
    f.total += w;
    uf.link(a, b);
  }
  return f;
}
