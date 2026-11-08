#pragma once
#include <algorithm>
#include <cstdlib>
#include <optional>
#include <utility>
#include <vector>

// Are all vertices with an edge connected (ignoring directions)?
inline bool onePiece(int n, const std::vector<std::pair<int, int>>& edges) {
  std::vector<std::vector<int>> adj(n);
  for (auto [u, v] : edges) {
    adj[u].push_back(v);
    adj[v].push_back(u);
  }
  std::vector<bool> seen(n, false);
  std::vector<int> stack = {edges[0].first};
  seen[edges[0].first] = true;
  while (!stack.empty()) {
    int u = stack.back();
    stack.pop_back();
    for (int w : adj[u])
      if (!seen[w]) {
        seen[w] = true;
        stack.push_back(w);
      }
  }
  for (int v = 0; v < n; v++)
    if (!adj[v].empty() && !seen[v]) return false;
  return true;
}

// An Euler path or circuit by Hierholzer's algorithm, or nothing.
inline std::optional<std::vector<int>> eulerPath(int n, const std::vector<std::pair<int, int>>& edges,
                                                 bool directed) {
  std::vector<std::vector<std::pair<int, int>>> out(n);  // {far end, edge index}
  std::vector<int> balance(n, 0);                         // out - in, or the degree
  for (int i = 0; i < static_cast<int>(edges.size()); i++) {
    auto [u, v] = edges[i];
    out[u].push_back({v, i});
    balance[u]++;
    if (directed) {
      balance[v]--;
    } else {
      out[v].push_back({u, i});
      balance[v]++;
    }
  }
  for (auto& l : out) std::sort(l.begin(), l.end());
  if (edges.empty() || !onePiece(n, edges)) return std::nullopt;
  std::vector<int> bad;
  for (int v = 0; v < n; v++)
    if (directed ? balance[v] != 0 : balance[v] % 2 == 1) bad.push_back(v);
  int start = -1;
  if (directed && !bad.empty()) {
    if (bad.size() != 2 || balance[bad[0]] + balance[bad[1]] != 0 || std::abs(balance[bad[0]]) != 1)
      return std::nullopt;
    start = balance[bad[0]] == 1 ? bad[0] : bad[1];
  } else if (!directed) {
    if (bad.size() != 0 && bad.size() != 2) return std::nullopt;
    if (!bad.empty()) start = bad[0];
  }
  for (int v = 0; start < 0; v++)
    if (!out[v].empty()) start = v;

  std::vector<bool> used(edges.size(), false);
  std::vector<std::size_t> next(n, 0);
  std::vector<int> stack = {start}, circuit;
  while (!stack.empty()) {
    int v = stack.back();
    while (next[v] < out[v].size() && used[out[v][next[v]].second]) next[v]++;
    if (next[v] < out[v].size()) {  // walk an unused edge
      used[out[v][next[v]].second] = true;
      stack.push_back(out[v][next[v]].first);
    } else {  // stuck: v goes at the front of the circuit
      circuit.push_back(v);
      stack.pop_back();
    }
  }
  std::reverse(circuit.begin(), circuit.end());
  return circuit;
}
