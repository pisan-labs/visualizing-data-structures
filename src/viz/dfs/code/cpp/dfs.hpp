#pragma once
#include <map>
#include <utility>
#include <vector>

// Depth-first search as in CLRS, with discovery and finish times. adj[u] lists u's neighbours
// in increasing order. The search starts at s, then goes on from every vertex that is still
// white, in order. kind[{u, v}] is 'T' (tree), 'B' (back), 'F' (forward) or 'C' (cross).
class Dfs {
 public:
  Dfs(const std::vector<std::vector<int>>& adj, int s, bool directed)
      : adj_(adj), directed_(directed), color_(adj.size(), WHITE), d(adj.size()),
        f(adj.size()), pi(adj.size(), -1) {
    visitIfWhite(s);
    for (int u = 0; u < static_cast<int>(adj.size()); u++) visitIfWhite(u);
  }

 private:
  enum Color { WHITE, GRAY, BLACK };
  const std::vector<std::vector<int>>& adj_;
  bool directed_;
  std::vector<Color> color_;
  int time_ = 0;

 public:
  std::vector<int> d, f, pi;  // pi is -1 for NIL
  std::map<std::pair<int, int>, char> kind;

 private:
  void visitIfWhite(int u) {
    if (color_[u] == WHITE) visit(u);
  }

  void visit(int u) {
    d[u] = ++time_;
    color_[u] = GRAY;
    for (int v : adj_[u]) {
      if (color_[v] == WHITE) {
        kind[{u, v}] = 'T';
        pi[v] = u;
        visit(v);
      } else if (color_[v] == GRAY) {
        if (directed_ || v != pi[u]) kind[{u, v}] = 'B';  // not the edge back to u's parent
      } else if (directed_) {                               // undirected: seen from v's end
        kind[{u, v}] = d[u] < d[v] ? 'F' : 'C';
      }
    }
    f[u] = ++time_;
    color_[u] = BLACK;
  }
};
