#pragma once
#include <optional>
#include <set>
#include <utility>
#include <vector>

// 2-SAT with Kosaraju's strongly connected components. Variables are
// 0..n-1; literal 2i means x_i and 2i + 1 means not x_i. Each clause {a, b}
// means (a or b). Returns each variable's value, or nothing when the formula
// is unsatisfiable.
inline std::optional<std::vector<bool>> two_sat(int n,
                                                const std::vector<std::pair<int, int>>& clauses) {
  const int m = 2 * n;
  std::vector<std::set<int>> arcs(m);
  for (const auto& [a, b] : clauses) {
    arcs[a ^ 1].insert(b);  // not a implies b
    arcs[b ^ 1].insert(a);  // not b implies a
  }
  std::vector<std::vector<int>> adj(m), transpose(m);
  for (int u = 0; u < m; u++) adj[u].assign(arcs[u].begin(), arcs[u].end());
  for (int u = 0; u < m; u++)
    for (int v : adj[u]) transpose[v].push_back(u);

  std::vector<bool> seen(m, false);
  auto visit = [&](auto&& self, int u, const std::vector<std::vector<int>>& graph,
                   std::vector<int>& out) -> void {
    seen[u] = true;
    for (int v : graph[u])
      if (!seen[v]) self(self, v, graph, out);
    out.push_back(u);
  };

  std::vector<int> finished;
  for (int u = 0; u < m; u++)  // pass 1: DFS(G)
    if (!seen[u]) visit(visit, u, adj, finished);

  seen.assign(m, false);
  std::vector<int> comp(m, -1);  // components numbered in topological order
  int count = 0;
  for (auto it = finished.rbegin(); it != finished.rend(); ++it) {  // pass 2
    if (seen[*it]) continue;
    std::vector<int> members;
    visit(visit, *it, transpose, members);
    for (int v : members) comp[v] = count;
    count++;
  }

  std::vector<bool> value(n);
  for (int i = 0; i < n; i++) {
    if (comp[2 * i] == comp[2 * i + 1]) return std::nullopt;
    value[i] = comp[2 * i] > comp[2 * i + 1];
  }
  return value;
}
