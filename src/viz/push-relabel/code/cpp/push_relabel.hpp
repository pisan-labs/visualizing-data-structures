#include <algorithm>
#include <climits>
#include <queue>
#include <vector>

// FIFO push-relabel: flood the arcs out of s, then push excess one level downhill.
// cap[u][v] is the capacity of the arc u -> v (0 for none). flow[u][v] is the net flow, so
// flow[v][u] == -flow[u][v] and the residual capacity is cap[u][v] - flow[u][v].
struct PushRelabel {
  std::vector<std::vector<int>> flow;
  int value = 0;
  int pushes = 0;
  int relabels = 0;
  std::vector<int> side;  // the s side of a minimum cut

  PushRelabel(const std::vector<std::vector<int>>& cap, int s, int t) {
    int n = static_cast<int>(cap.size());
    flow.assign(n, std::vector<int>(n, 0));
    std::vector<int> height(n, 0), excess(n, 0), current(n, 0);
    std::vector<std::vector<int>> nbrs(n);
    for (int u = 0; u < n; u++)
      for (int v = 0; v < n; v++)
        if (cap[u][v] > 0 || cap[v][u] > 0) nbrs[u].push_back(v);
    height[s] = n;
    std::queue<int> queue;
    for (int v = 0; v < n; v++) {  // the preflow: fill every arc out of s
      if (cap[s][v] > 0) {
        flow[s][v] = cap[s][v];
        flow[v][s] = -cap[s][v];
        excess[v] += cap[s][v];
        excess[s] -= cap[s][v];
        if (v != t) queue.push(v);
      }
    }
    while (!queue.empty()) {
      int u = queue.front();
      queue.pop();
      while (excess[u] > 0) {  // discharge u
        const auto& list = nbrs[u];
        if (current[u] == static_cast<int>(list.size())) {  // relabel
          int low = INT_MAX;
          for (int v : list)
            if (cap[u][v] - flow[u][v] > 0) low = std::min(low, height[v]);
          height[u] = low + 1;
          current[u] = 0;
          relabels++;
          continue;
        }
        int v = list[current[u]];
        int room = cap[u][v] - flow[u][v];
        if (room > 0 && height[u] == height[v] + 1) {  // admissible: push
          int d = std::min(excess[u], room);
          flow[u][v] += d;
          flow[v][u] -= d;
          excess[u] -= d;
          excess[v] += d;
          pushes++;
          if (v != s && v != t && excess[v] == d) queue.push(v);  // v just started to overflow
        } else {
          current[u]++;
        }
      }
    }
    value = excess[t];
    std::vector<bool> seen(n, false);
    std::vector<int> todo{s};
    seen[s] = true;
    while (!todo.empty()) {
      int u = todo.back();
      todo.pop_back();
      for (int v = 0; v < n; v++)
        if (!seen[v] && cap[u][v] - flow[u][v] > 0) {
          seen[v] = true;
          todo.push_back(v);
        }
    }
    for (int v = 0; v < n; v++)
      if (seen[v]) side.push_back(v);
  }
};
