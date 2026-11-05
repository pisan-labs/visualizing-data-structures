#pragma once
#include <vector>

// Range sums, point updates and range adds with lazy propagation.
// Node v covers A[lo..hi]; its children are 2v for A[lo..mid] and 2v + 1 for A[mid+1..hi].
// lazy[v] is an add that node v still owes its children.
class SegmentTree {
 public:
  explicit SegmentTree(const std::vector<int>& values)
      : n_(static_cast<int>(values.size())), tree_(4 * values.size()), lazy_(4 * values.size()) {
    build(1, 0, n_ - 1, values);
  }

  // A[l] + ... + A[r]. O(log n).
  long long query(int l, int r) { return query(1, 0, n_ - 1, l, r); }

  // Set A[i] to x. O(log n).
  void update(int i, long long x) { update(1, 0, n_ - 1, i, x); }

  // Add x to every value in A[l..r]. O(log n), thanks to the lazy tags.
  void add(int l, int r, long long x) { add(1, 0, n_ - 1, l, r, x); }

 private:
  void build(int v, int lo, int hi, const std::vector<int>& a) {
    if (lo == hi) {
      tree_[v] = a[lo];
      return;
    }
    int mid = (lo + hi) / 2;
    build(2 * v, lo, mid, a);
    build(2 * v + 1, mid + 1, hi, a);
    tree_[v] = tree_[2 * v] + tree_[2 * v + 1];
  }

  void apply(int v, int lo, int hi, long long x) {
    tree_[v] += x * (hi - lo + 1);
    if (lo < hi) lazy_[v] += x;
  }

  void push(int v, int lo, int hi) {
    if (lazy_[v] != 0) {
      int mid = (lo + hi) / 2;
      apply(2 * v, lo, mid, lazy_[v]);
      apply(2 * v + 1, mid + 1, hi, lazy_[v]);
      lazy_[v] = 0;
    }
  }

  long long query(int v, int lo, int hi, int l, int r) {
    if (r < lo || hi < l) return 0;            // no overlap
    if (l <= lo && hi <= r) return tree_[v];   // full overlap
    push(v, lo, hi);                           // partial overlap
    int mid = (lo + hi) / 2;
    return query(2 * v, lo, mid, l, r) + query(2 * v + 1, mid + 1, hi, l, r);
  }

  void update(int v, int lo, int hi, int i, long long x) {
    if (lo == hi) {
      tree_[v] = x;
      return;
    }
    push(v, lo, hi);
    int mid = (lo + hi) / 2;
    if (i <= mid) {
      update(2 * v, lo, mid, i, x);
    } else {
      update(2 * v + 1, mid + 1, hi, i, x);
    }
    tree_[v] = tree_[2 * v] + tree_[2 * v + 1];
  }

  void add(int v, int lo, int hi, int l, int r, long long x) {
    if (r < lo || hi < l) return;
    if (l <= lo && hi <= r) {
      apply(v, lo, hi, x);
      return;
    }
    push(v, lo, hi);
    int mid = (lo + hi) / 2;
    add(2 * v, lo, mid, l, r, x);
    add(2 * v + 1, mid + 1, hi, l, r, x);
    tree_[v] = tree_[2 * v] + tree_[2 * v + 1];
  }

  int n_;
  std::vector<long long> tree_;
  std::vector<long long> lazy_;
};
