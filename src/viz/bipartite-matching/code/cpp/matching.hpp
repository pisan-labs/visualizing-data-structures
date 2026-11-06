#include <vector>

// Kuhn's algorithm: an augmenting path search from each left vertex in turn.
// adj[u] lists the right vertices joined to left vertex u, in order. matchR[v] is the left
// partner of right vertex v, or -1 if v is free.
struct Matching {
  const std::vector<std::vector<int>>& adj;
  std::vector<int> matchR;
  int size = 0;

  Matching(const std::vector<std::vector<int>>& adj, int nRight) : adj(adj), matchR(nRight, -1) {
    for (int u = 0; u < static_cast<int>(adj.size()); u++) {
      std::vector<bool> visited(nRight, false);
      if (tryMatch(u, visited)) size++;
    }
  }

  bool tryMatch(int u, std::vector<bool>& visited) {
    for (int v : adj[u]) {
      if (visited[v]) continue;
      visited[v] = true;
      // v is free, or its partner can move to another right vertex.
      if (matchR[v] == -1 || tryMatch(matchR[v], visited)) {
        matchR[v] = u;
        return true;
      }
    }
    return false;
  }
};
