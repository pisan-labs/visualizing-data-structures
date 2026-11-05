#pragma once
#include <algorithm>
#include <vector>

// A graph on vertices 0..n-1. adj[u] holds u's neighbours in increasing order.
class AdjacencyList {
 public:
  AdjacencyList(int n, bool directed) : adj_(n), directed_(directed) {}

  bool hasEdge(int u, int v) const {
    for (int x : adj_[u]) {  // O(degree of u)
      if (x == v) return true;
    }
    return false;
  }

  bool addEdge(int u, int v) {
    if (hasEdge(u, v)) return false;
    insertInOrder(adj_[u], v);
    if (!directed_) insertInOrder(adj_[v], u);
    return true;
  }

  bool removeEdge(int u, int v) {
    if (!hasEdge(u, v)) return false;
    erase(adj_[u], v);
    if (!directed_) erase(adj_[v], u);
    return true;
  }

  std::vector<int> neighbours(int u) const { return adj_[u]; }  // O(degree of u)

 private:
  static void insertInOrder(std::vector<int>& list, int x) {
    list.insert(std::lower_bound(list.begin(), list.end(), x), x);
  }
  static void erase(std::vector<int>& list, int x) {
    list.erase(std::find(list.begin(), list.end(), x));
  }

  std::vector<std::vector<int>> adj_;
  bool directed_;
};

// A graph on vertices 0..n-1. m[u][v] is true when there is an edge u -> v.
class AdjacencyMatrix {
 public:
  AdjacencyMatrix(int n, bool directed)
      : m_(n, std::vector<bool>(n, false)), directed_(directed) {}  // O(n^2) space

  bool hasEdge(int u, int v) const { return m_[u][v]; }  // O(1)

  bool addEdge(int u, int v) {
    if (m_[u][v]) return false;
    m_[u][v] = true;
    if (!directed_) m_[v][u] = true;
    return true;
  }

  bool removeEdge(int u, int v) {
    if (!m_[u][v]) return false;
    m_[u][v] = false;
    if (!directed_) m_[v][u] = false;
    return true;
  }

  std::vector<int> neighbours(int u) const {
    std::vector<int> out;
    for (int v = 0; v < static_cast<int>(m_.size()); v++) {  // O(n)
      if (m_[u][v]) out.push_back(v);
    }
    return out;
  }

 private:
  std::vector<std::vector<bool>> m_;
  bool directed_;
};
