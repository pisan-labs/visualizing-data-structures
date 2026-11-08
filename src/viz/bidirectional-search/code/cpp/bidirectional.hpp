#pragma once
#include <deque>
#include <map>
#include <vector>

struct Search {
  std::vector<int> path;  // empty when t cannot be reached
  int expanded = 0;
};

// Shortest path from s to t by BFS from both ends, one layer per turn.
// adj: out-neighbours, radj: in-neighbours (the same when undirected), sorted.
inline Search bidirectionalBfs(const std::vector<std::vector<int>>& adj,
                               const std::vector<std::vector<int>>& radj, int s, int t) {
  Search out;
  if (s == t) {
    out.path = {s};
    return out;
  }
  std::map<int, int> dist[2] = {{{s, 0}}, {{t, 0}}};
  std::map<int, int> parent[2];
  std::vector<int> frontier[2] = {{s}, {t}};
  const std::vector<std::vector<int>>* graph[2] = {&adj, &radj};
  int side = 1;
  while (!frontier[0].empty() && !frontier[1].empty()) {
    side = 1 - side;  // take turns: s side, t side, ...
    auto& mine = dist[side];
    auto& theirs = dist[1 - side];
    std::vector<int> layer;
    for (int u : frontier[side]) {
      out.expanded++;
      for (int v : (*graph[side])[u]) {
        if (mine.count(v)) continue;
        mine[v] = mine[u] + 1;
        parent[side][v] = u;
        layer.push_back(v);
        if (theirs.count(v)) {  // the searches meet: join the halves
          std::deque<int> p = {v};
          while (parent[0].count(p.front())) p.push_front(parent[0][p.front()]);
          while (parent[1].count(p.back())) p.push_back(parent[1][p.back()]);
          out.path.assign(p.begin(), p.end());
          return out;
        }
      }
    }
    frontier[side] = layer;
  }
  return out;
}
