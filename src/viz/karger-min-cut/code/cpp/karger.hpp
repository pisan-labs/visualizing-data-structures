#include <algorithm>
#include <functional>
#include <utility>
#include <vector>

// One trial of Karger's algorithm on vertices 0..n-1: contract a random edge until two
// super-vertices are left. randInt(lo, hi) returns a random int in [lo, hi].
struct Karger {
  std::vector<int> group;                 // each vertex's super-vertex: its smallest member
  std::vector<std::pair<int, int>> cut;   // the edges between the two that are left

  Karger(int n, const std::vector<std::pair<int, int>>& edges,
         const std::function<int(int, int)>& randInt) {
    group.resize(n);
    for (int v = 0; v < n; v++) group[v] = v;
    int count = n;
    while (count > 2) {
      std::vector<std::pair<int, int>> left;  // self-loops are gone
      for (const auto& e : edges)
        if (group[e.first] != group[e.second]) left.push_back(e);
      if (left.empty()) break;  // not connected: the cut is empty
      auto e = left[randInt(0, static_cast<int>(left.size()) - 1)];
      int keep = std::min(group[e.first], group[e.second]);
      int gone = std::max(group[e.first], group[e.second]);
      for (int& g : group)
        if (g == gone) g = keep;
      count--;
    }
    for (const auto& e : edges)
      if (group[e.first] != group[e.second]) cut.push_back(e);
  }
};
