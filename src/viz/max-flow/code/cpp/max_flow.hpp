#include <algorithm>
#include <climits>
#include <queue>
#include <vector>

// Edmonds-Karp: Ford-Fulkerson with breadth-first search for each augmenting path.
// cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
// flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v].
struct MaxFlow {
  std::vector<std::vector<int>> flow;
  int value = 0;
  int paths = 0;
  std::vector<int> side;  // the s side of a minimum cut

  MaxFlow(const std::vector<std::vector<int>>& cap, int s, int t) {
    int n = static_cast<int>(cap.size());
    flow.assign(n, std::vector<int>(n, 0));
    std::vector<int> parent(n);
    while (true) {
      std::fill(parent.begin(), parent.end(), -1);
      parent[s] = s;
      std::queue<int> queue;
      queue.push(s);
      while (!queue.empty() && parent[t] == -1) {
        int u = queue.front();
        queue.pop();
        for (int v = 0; v < n; v++) {
          if (parent[v] == -1 && cap[u][v] - flow[u][v] > 0) {
            parent[v] = u;
            queue.push(v);
            if (v == t) break;
          }
        }
      }
      if (parent[t] == -1) break;
      int b = INT_MAX;
      for (int v = t; v != s; v = parent[v]) b = std::min(b, cap[parent[v]][v] - flow[parent[v]][v]);
      for (int v = t; v != s; v = parent[v]) {
        flow[parent[v]][v] += b;
        flow[v][parent[v]] -= b;
      }
      value += b;
      paths++;
    }
    for (int v = 0; v < n; v++)
      if (parent[v] != -1) side.push_back(v);
  }
};
