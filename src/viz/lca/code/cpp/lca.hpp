#pragma once
#include <algorithm>
#include <utility>
#include <vector>

// Lowest common ancestors on a rooted tree in O(log n) per query.
// up[k][v] is the ancestor 2^k steps above v, or -1 past the root.
class BinaryLifting {
 public:
  BinaryLifting(const std::vector<std::vector<int>>& adj, int root) {
    int n = static_cast<int>(adj.size());
    while ((1 << log_) < n) log_++;  // ceil(log2 n), at least 1
    log_ = std::max(log_, 1);
    depth_.assign(n, -1);
    up_.assign(log_, std::vector<int>(n, -1));
    depth_[root] = 0;
    std::vector<int> order = {root};
    for (std::size_t i = 0; i < order.size(); i++) {  // BFS: depths and parents
      int u = order[i];
      for (int w : adj[u])
        if (depth_[w] < 0) {
          depth_[w] = depth_[u] + 1;
          up_[0][w] = u;
          order.push_back(w);
        }
    }
    for (int k = 1; k < log_; k++)
      for (int v = 0; v < n; v++) up_[k][v] = up_[k - 1][v] < 0 ? -1 : up_[k - 1][up_[k - 1][v]];
  }

  int lca(int u, int v) const {
    if (depth_[u] < depth_[v]) std::swap(u, v);
    for (int diff = depth_[u] - depth_[v], k = 0; diff > 0; diff >>= 1, k++)
      if (diff & 1) u = up_[k][u];  // lift u, one jump per 1-bit
    if (u == v) return u;
    for (int k = log_ - 1; k >= 0; k--)
      if (up_[k][u] != up_[k][v]) {
        u = up_[k][u];
        v = up_[k][v];
      }
    return up_[0][u];
  }

 private:
  int log_ = 0;
  std::vector<int> depth_;
  std::vector<std::vector<int>> up_;
};
