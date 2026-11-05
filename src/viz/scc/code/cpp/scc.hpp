#pragma once
#include <algorithm>
#include <vector>

// Kosaraju's algorithm, as in CLRS. adj[u] lists the vertices u points to, in increasing order.
// Returns the components in the order the second pass finds them (a topological order of the
// component graph), each sorted.
class Kosaraju {
 public:
  using Graph = std::vector<std::vector<int>>;

  static std::vector<std::vector<int>> components(const Graph& adj) {
    int n = static_cast<int>(adj.size());
    Kosaraju k(n);
    std::vector<int> finished;  // in the order they finish
    for (int u = 0; u < n; u++)  // pass 1: DFS(G)
      if (!k.seen_[u]) k.visit(u, adj, finished);
    Graph transpose(n);
    for (int u = 0; u < n; u++)
      for (int v : adj[u]) transpose[v].push_back(u);  // stays sorted: u goes up
    k.seen_.assign(n, false);
    std::vector<std::vector<int>> result;
    for (auto it = finished.rbegin(); it != finished.rend(); ++it) {  // pass 2: DFS(G^T)
      if (k.seen_[*it]) continue;
      std::vector<int> component;
      k.visit(*it, transpose, component);
      std::sort(component.begin(), component.end());
      result.push_back(component);
    }
    return result;
  }

 private:
  explicit Kosaraju(int n) : seen_(n, false) {}
  std::vector<bool> seen_;

  void visit(int u, const Graph& graph, std::vector<int>& out) {
    seen_[u] = true;
    for (int v : graph[u])
      if (!seen_[v]) visit(v, graph, out);
    out.push_back(u);
  }
};
