#pragma once
#include <algorithm>
#include <limits>
#include <utility>
#include <vector>

// Shortest paths from s in a DAG: relax each vertex's edges in topological order.
// adj[u] lists edges {v, w}.
const long long INF = std::numeric_limits<long long>::max();

struct Paths {
  std::vector<long long> d;  // INF when unreachable
  std::vector<int> pi;       // -1 when there is no parent (NIL)
  std::vector<int> cycle;    // if the graph has a cycle: its vertices, and no d or pi
};

class DagShortestPaths {
 public:
  explicit DagShortestPaths(const std::vector<std::vector<std::pair<int, int>>>& adj)
      : adj_(adj), color_(adj.size(), WHITE) {}

  Paths run(int s) {
    Paths r;
    int n = static_cast<int>(adj_.size());
    for (int u = 0; u < n && cycle_.empty(); u++)
      if (color_[u] == WHITE) visit(u);
    if (!cycle_.empty()) {
      r.cycle = cycle_;
      return r;
    }
    r.d.assign(n, INF);
    r.pi.assign(n, -1);
    r.d[s] = 0;
    for (int u : order_) {
      if (r.d[u] == INF) continue;
      for (auto [v, w] : adj_[u]) {
        if (r.d[u] + w < r.d[v]) {
          r.d[v] = r.d[u] + w;
          r.pi[v] = u;
        }
      }
    }
    return r;
  }

 private:
  enum Color { WHITE, GRAY, BLACK };

  // Depth-first search from u; stops at the first edge back to a gray vertex.
  void visit(int u) {
    color_[u] = GRAY;
    path_.push_back(u);
    for (auto [v, w] : adj_[u]) {
      (void)w;
      if (color_[v] == GRAY) {
        cycle_.assign(std::find(path_.begin(), path_.end(), v), path_.end());
        return;
      }
      if (color_[v] == WHITE) {
        visit(v);
        if (!cycle_.empty()) return;
      }
    }
    color_[u] = BLACK;
    path_.pop_back();
    order_.insert(order_.begin(), u);  // put u at the front of the list
  }

  const std::vector<std::vector<std::pair<int, int>>>& adj_;
  std::vector<Color> color_;
  std::vector<int> order_, path_, cycle_;
};
