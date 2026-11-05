#pragma once
#include <map>

// Union-find: union by rank with path compression.
class DisjointSets {
 public:
  std::map<int, int> parent;

  void makeSet(int x) {
    parent[x] = x;
    rank_[x] = 0;
  }

  int find(int x) {
    if (parent[x] != x) parent[x] = find(parent[x]);  // path compression
    return parent[x];
  }

  // Joins the sets of x and y. Returns the new root, or -1 if they were joined already.
  int unite(int x, int y) {
    int a = find(x), b = find(y);
    if (a == b) return -1;
    if (rank_[a] > rank_[b]) {
      parent[b] = a;
      return a;
    }
    parent[a] = b;
    if (rank_[a] == rank_[b]) rank_[b]++;
    return b;
  }

 private:
  std::map<int, int> rank_;
};
