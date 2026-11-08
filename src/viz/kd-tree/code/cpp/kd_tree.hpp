#pragma once
#include <climits>
#include <memory>
#include <vector>

struct Point {
  long x, y;
  long get(int axis) const { return axis == 0 ? x : y; }
  bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};

// A 2-d tree: nodes split on x at even depths and on y at odd depths.
class KdTree {
  struct Node {
    Point p;
    int depth;
    std::unique_ptr<Node> left, right;
  };
  std::unique_ptr<Node> root;

  static long dist2(const Point& a, const Point& b) {
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  }

  void nearest(const Node* x, const Point& q, const Point*& best, long& bestD2) const {
    if (!x) return;
    long d = dist2(q, x->p);
    if (d < bestD2) {
      best = &x->p;
      bestD2 = d;
    }
    int a = x->depth % 2;
    long diff = q.get(a) - x->p.get(a);
    const Node* near = diff < 0 ? x->left.get() : x->right.get();
    const Node* far = diff < 0 ? x->right.get() : x->left.get();
    nearest(near, q, best, bestD2);
    if (diff * diff < bestD2) nearest(far, q, best, bestD2);  // the circle crosses the line
  }

  void range(const Node* x, const Point& lo, const Point& hi, std::vector<Point>& out) const {
    if (!x) return;
    const Point& p = x->p;
    if (lo.x <= p.x && p.x <= hi.x && lo.y <= p.y && p.y <= hi.y) out.push_back(p);
    int a = x->depth % 2;
    if (lo.get(a) < p.get(a)) range(x->left.get(), lo, hi, out);
    if (hi.get(a) >= p.get(a)) range(x->right.get(), lo, hi, out);
  }

 public:
  void insert(const Point& p) {
    std::unique_ptr<Node>* slot = &root;
    int depth = 0;
    while (*slot) {
      Node* x = slot->get();
      if (x->p == p) return;  // already in the tree
      int a = x->depth % 2;
      slot = p.get(a) < x->p.get(a) ? &x->left : &x->right;
      depth = x->depth + 1;
    }
    *slot = std::make_unique<Node>(Node{p, depth, nullptr, nullptr});
  }

  // The point nearest q (nullptr if empty); its squared distance goes into bestD2.
  const Point* nearest(const Point& q, long& bestD2) const {
    const Point* best = nullptr;
    bestD2 = LONG_MAX;
    nearest(root.get(), q, best, bestD2);
    return best;
  }

  std::vector<Point> range(const Point& lo, const Point& hi) const {
    std::vector<Point> out;
    range(root.get(), lo, hi, out);
    return out;
  }
};
