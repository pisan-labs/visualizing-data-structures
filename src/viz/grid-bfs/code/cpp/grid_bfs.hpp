#pragma once
#include <algorithm>
#include <deque>
#include <string>
#include <vector>

// Clockwise from north. The even entries are the four straight moves.
const int MOVES[8][2] = {{-1, 0}, {-1, 1}, {0, 1}, {1, 1}, {1, 0}, {1, -1}, {0, -1}, {-1, -1}};

struct GridPath {
  std::vector<int> path;  // cells r * cols + c from S to T; empty if there is none
  int expanded = 0;       // cells that left the queue
};

inline int findCell(const std::vector<std::string>& grid, char ch) {
  for (size_t r = 0; r < grid.size(); r++) {
    size_t c = grid[r].find(ch);
    if (c != std::string::npos) return static_cast<int>(r * grid[0].size() + c);
  }
  return -1;
}

// Shortest path from S to T in a grid of strings ('.' open, '#' wall).
inline GridPath gridBfs(const std::vector<std::string>& grid, bool eight) {
  int rows = static_cast<int>(grid.size()), cols = static_cast<int>(grid[0].size());
  int s = findCell(grid, 'S'), t = findCell(grid, 'T');
  std::vector<int> d(rows * cols, -1), parent(rows * cols, -1);
  GridPath out;
  d[s] = 0;
  std::deque<int> q{s};
  while (!q.empty()) {
    int u = q.front();
    q.pop_front();
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
      if (d[v] == -1) {
        d[v] = d[u] + 1;
        parent[v] = u;
        q.push_back(v);
      }
    }
  }
  return out;
}
