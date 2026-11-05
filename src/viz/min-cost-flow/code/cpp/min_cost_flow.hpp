#include <algorithm>
#include <climits>
#include <vector>

// Successive shortest paths, with Bellman-Ford for each cheapest path.
// cap[u][v] and cost[u][v] describe the arc u -> v (0 capacity for none; no pair of vertices
// has arcs both ways). flow[u][v] is the net flow, so flow[v][u] == -flow[u][v]. A residual arc
// u -> v costs cost[u][v] when it is a real arc and -cost[v][u] when it sends flow back.
// want == 0 sends as much as possible.
struct MinCostFlow {
  static constexpr long long INF = LLONG_MAX / 4;
  std::vector<std::vector<int>> flow;
  int value = 0;
  long long total = 0;
  int paths = 0;

  MinCostFlow(const std::vector<std::vector<int>>& cap, const std::vector<std::vector<int>>& cost,
              int s, int t, int want) {
    int n = static_cast<int>(cap.size());
    flow.assign(n, std::vector<int>(n, 0));
    std::vector<std::vector<int>> w(n, std::vector<int>(n));
    for (int u = 0; u < n; u++)
      for (int v = 0; v < n; v++) w[u][v] = cap[u][v] > 0 ? cost[u][v] : -cost[v][u];
    std::vector<long long> d(n);
    std::vector<int> parent(n);
    while (want == 0 || value < want) {
      std::fill(d.begin(), d.end(), INF);
      std::fill(parent.begin(), parent.end(), -1);
      d[s] = 0;
      for (int pass = 1; pass < n; pass++) {
        bool changed = false;
        for (int u = 0; u < n; u++) {
          if (d[u] == INF) continue;
          for (int v = 0; v < n; v++) {
            if (cap[u][v] - flow[u][v] > 0 && d[u] + w[u][v] < d[v]) {
              d[v] = d[u] + w[u][v];
              parent[v] = u;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
      if (d[t] == INF) break;
      int b = want > 0 ? want - value : INT_MAX;
      for (int v = t; v != s; v = parent[v]) b = std::min(b, cap[parent[v]][v] - flow[parent[v]][v]);
      for (int v = t; v != s; v = parent[v]) {
        flow[parent[v]][v] += b;
        flow[v][parent[v]] -= b;
      }
      value += b;
      total += b * d[t];
      paths++;
    }
  }
};
