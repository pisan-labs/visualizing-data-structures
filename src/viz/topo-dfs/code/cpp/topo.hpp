#pragma once
#include <deque>
#include <vector>

// Topological sort by DFS, as in CLRS. adj[u] lists the vertices u points to, in increasing
// order. Each vertex goes on the front of `order` as it finishes, so it ends up in decreasing
// finish time. If DFS meets a back edge u -> v, it stops: hasCycle is true and (cycleU, cycleV)
// is that edge.
class TopoSort {
 public:
  explicit TopoSort(const std::vector<std::vector<int>>& adj)
      : adj_(adj), color_(adj.size(), WHITE) {
    for (int u = 0; u < static_cast<int>(adj.size()) && !hasCycle; u++)
      if (color_[u] == WHITE) visit(u);
  }

  std::deque<int> order;
  bool hasCycle = false;
  int cycleU = -1, cycleV = -1;

 private:
  enum Color { WHITE, GRAY, BLACK };
  const std::vector<std::vector<int>>& adj_;
  std::vector<Color> color_;

  void visit(int u) {
    color_[u] = GRAY;
    for (int v : adj_[u]) {
      if (color_[v] == WHITE) {
        visit(v);
        if (hasCycle) return;
      } else if (color_[v] == GRAY) {  // v is an ancestor of u: a back edge
        hasCycle = true;
        cycleU = u;
        cycleV = v;
        return;
      }
    }
    color_[u] = BLACK;
    order.push_front(u);
  }
};
