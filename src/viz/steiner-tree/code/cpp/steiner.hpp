#pragma once
#include <algorithm>
#include <functional>
#include <limits>
#include <set>
#include <utility>
#include <vector>

// Steiner trees on vertices 0..n-1. w[u][v] > 0 is the weight of edge u-v, 0 for none; the
// terminals are sorted. Edges are {u, v} pairs.
using Matrix = std::vector<std::vector<int>>;
using Edge = std::pair<int, int>;
constexpr long long INF = std::numeric_limits<long long>::max() / 4;

// Prim with an array over nodes; weight gives -1 for no edge. Ties to the earlier node.
inline std::vector<Edge> prim(const std::vector<int>& nodes,
                              const std::function<long long(int, int)>& weight) {
  int k = static_cast<int>(nodes.size());
  std::vector<long long> key(k, INF);
  std::vector<int> parent(k, -1);
  std::vector<bool> done(k, false);
  std::vector<Edge> edges;
  key[0] = 0;
  for (int round = 0; round < k; round++) {
    int u = -1;
    for (int i = 0; i < k; i++)
      if (!done[i] && key[i] < INF && (u < 0 || key[i] < key[u])) u = i;
    if (u < 0) break;  // the rest cannot be reached
    done[u] = true;
    if (parent[u] >= 0) edges.push_back({nodes[parent[u]], nodes[u]});
    for (int i = 0; i < k; i++) {
      long long x = weight(nodes[u], nodes[i]);
      if (!done[i] && x >= 0 && x < key[i]) {
        key[i] = x;
        parent[i] = u;
      }
    }
  }
  return edges;
}

inline Edge sorted(int u, int v) { return {std::min(u, v), std::max(u, v)}; }

// The metric-closure 2-approximation. Returns the tree's edges {u, v}, u < v, sorted.
inline std::vector<Edge> approxSteiner(const Matrix& w, const std::vector<int>& terminals) {
  int n = static_cast<int>(w.size());
  if (terminals.size() <= 1) return {};
  // Shortest distances between all pairs (Floyd-Warshall).
  std::vector<std::vector<long long>> d(n, std::vector<long long>(n, INF));
  for (int i = 0; i < n; i++)
    for (int j = 0; j < n; j++) d[i][j] = i == j ? 0 : w[i][j] > 0 ? w[i][j] : INF;
  for (int k = 0; k < n; k++)
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++) d[i][j] = std::min(d[i][j], d[i][k] + d[k][j]);
  std::set<Edge> h;
  for (auto [s, t] : prim(terminals, [&](int a, int b) { return d[a][b]; })) {
    // Trace back from t through the earliest neighbour on a shortest path.
    for (int v = t; v != s;) {
      int u = 0;
      while (w[u][v] == 0 || d[s][u] + w[u][v] != d[s][v]) u++;
      h.insert(sorted(u, v));
      v = u;
    }
  }
  std::set<int> nodeSet(terminals.begin(), terminals.end());
  for (auto [u, v] : h) nodeSet.insert({u, v});
  std::vector<int> nodes(nodeSet.begin(), nodeSet.end());
  std::set<Edge> tree;
  for (auto [u, v] : prim(nodes, [&](int a, int b) { return h.count(sorted(a, b)) ? w[a][b] : -1LL; }))
    tree.insert(sorted(u, v));
  for (bool cut = true; cut;) {  // cut off leaves that are not terminals
    cut = false;
    std::vector<int> degree(n, 0);
    for (auto [u, v] : tree) degree[u]++, degree[v]++;
    for (int v = 0; v < n && !cut; v++) {
      if (degree[v] != 1 || std::count(terminals.begin(), terminals.end(), v)) continue;
      for (auto it = tree.begin(); it != tree.end(); ++it) {
        if (it->first == v || it->second == v) {
          tree.erase(it);
          cut = true;
          break;
        }
      }
    }
  }
  return {tree.begin(), tree.end()};
}

// Brute force over every set S of other vertices: the lightest MST of the terminals and S.
inline long long exactSteinerWeight(const Matrix& w, const std::vector<int>& terminals) {
  if (terminals.size() <= 1) return 0;
  std::vector<int> others;
  for (int v = 0; v < static_cast<int>(w.size()); v++)
    if (!std::count(terminals.begin(), terminals.end(), v)) others.push_back(v);
  long long best = INF;
  for (int mask = 0; mask < (1 << others.size()); mask++) {
    std::set<int> pick(terminals.begin(), terminals.end());
    for (size_t i = 0; i < others.size(); i++)
      if (mask >> i & 1) pick.insert(others[i]);
    std::vector<int> nodes(pick.begin(), pick.end());
    auto edges = prim(nodes, [&](int a, int b) { return w[a][b] > 0 ? w[a][b] : -1LL; });
    if (edges.size() + 1 != nodes.size()) continue;
    long long total = 0;
    for (auto [u, v] : edges) total += w[u][v];
    best = std::min(best, total);
  }
  return best;
}
