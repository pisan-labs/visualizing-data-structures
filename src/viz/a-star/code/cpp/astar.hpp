#pragma once
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <queue>
#include <string>
#include <tuple>
#include <vector>

// Clockwise from north. The even entries are the four straight moves.
const int MOVES[8][2] = {{-1, 0}, {-1, 1}, {0, 1}, {1, 1}, {1, 0}, {1, -1}, {0, -1}, {-1, -1}};

struct AStarResult {
  std::vector<int> path;  // cells r * cols + c from S to T; empty if there is none
  int expanded = 0;       // cells taken from the open set and expanded
};

inline int findCell(const std::vector<std::string>& grid, char ch) {
  for (size_t r = 0; r < grid.size(); r++) {
    size_t c = grid[r].find(ch);
    if (c != std::string::npos) return static_cast<int>(r * grid[0].size() + c);
  }
  return -1;
}

// A* from S to T in a grid of strings ('.' open, '#' wall); every move costs 1.
// Ties on f go to the smaller h, then to the entry added first.
inline AStarResult aStar(const std::vector<std::string>& grid, const std::string& heuristic,
                         double w, bool eight) {
  int rows = static_cast<int>(grid.size()), cols = static_cast<int>(grid[0].size());
  int s = findCell(grid, 'S'), t = findCell(grid, 'T');
  auto h = [&](int k) -> double {
    int dr = std::abs(k / cols - t / cols), dc = std::abs(k % cols - t % cols);
    if (heuristic == "manhattan") return dr + dc;
    if (heuristic == "euclidean") return std::sqrt(static_cast<double>(dr * dr + dc * dc));
    if (heuristic == "chebyshev") return std::max(dr, dc);
    return 0;
  };
  std::vector<int> g(rows * cols, -1), parent(rows * cols, -1);
  std::vector<bool> closed(rows * cols, false);
  // (f, h, order, cell): the smallest tuple comes out first.
  using Entry = std::tuple<double, double, int, int>;
  std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> open;
  int count = 0;
  g[s] = 0;
  open.emplace(w * h(s), h(s), count, s);
  AStarResult out;
  while (!open.empty()) {
    int u = std::get<3>(open.top());
    open.pop();
    if (closed[u]) continue;  // an older, worse entry for a cell already expanded
    closed[u] = true;
    out.expanded++;
    if (u == t) {
      for (int x = t; x != -1; x = parent[x]) out.path.push_back(x);
      std::reverse(out.path.begin(), out.path.end());
      return out;
    }
    for (int m = 0; m < 8; m += eight ? 1 : 2) {
      int r = u / cols + MOVES[m][0], c = u % cols + MOVES[m][1];
      if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] == '#') continue;
      int v = r * cols + c;
      if (closed[v]) continue;
      int cost = g[u] + 1;
      if (g[v] == -1 || cost < g[v]) {
        g[v] = cost;
        parent[v] = u;
        open.emplace(cost + w * h(v), h(v), ++count, v);
      }
    }
  }
  return out;
}
