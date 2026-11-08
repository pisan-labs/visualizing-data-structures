#pragma once
#include <algorithm>
#include <cmath>
#include <vector>

struct Ranks {
  std::vector<double> rank;
  int iterations = 0;
};

// PageRank by power iteration. links[u] lists the vertices u links to. Rank on
// dangling vertices (no links out) is spread evenly, or dropped when !spread.
inline Ranks pagerank(const std::vector<std::vector<int>>& links, double d, bool spread,
                      double tol = 0.001, int maxIter = 100) {
  int n = static_cast<int>(links.size());
  std::vector<std::vector<int>> into(n);
  for (int u = 0; u < n; u++)
    for (int v : links[u]) into[v].push_back(u);
  for (auto& l : into) std::sort(l.begin(), l.end());
  Ranks r;
  r.rank.assign(n, 1.0 / n);
  for (r.iterations = 1; r.iterations <= maxIter; r.iterations++) {
    double dangling = 0;
    for (int u = 0; u < n; u++)
      if (links[u].empty()) dangling += r.rank[u];
    std::vector<double> next(n);
    for (int v = 0; v < n; v++) {
      double s = 0;
      for (int u : into[v]) s += r.rank[u] / static_cast<double>(links[u].size());
      next[v] = (1 - d) / n + d * (spread ? s + dangling / n : s);
    }
    double change = 0;
    for (int v = 0; v < n; v++) change += std::fabs(next[v] - r.rank[v]);
    r.rank = next;
    if (change < tol) break;
  }
  r.iterations = std::min(r.iterations, maxIter);
  return r;
}
