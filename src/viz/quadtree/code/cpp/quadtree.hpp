#pragma once
#include <algorithm>
#include <array>
#include <memory>
#include <set>
#include <utility>
#include <vector>

using Point = std::pair<int, int>;  // (x, y)

// A point-region quadtree over [0, side)^2; a leaf holds up to `capacity` points.
class QuadTree {
  struct Node {
    int x0, y0, size, depth;
    std::vector<Point> points;
    std::array<std::unique_ptr<Node>, 4> kids;  // NW, NE, SW, SE once split

    bool leaf() const { return !kids[0]; }

    int quadrant(const Point& p) const {
      int h = size / 2;
      bool east = p.first >= x0 + h, north = p.second >= y0 + h;
      return (north ? 0 : 2) + (east ? 1 : 0);
    }

    void split() {
      int h = size / 2;
      const int dx[] = {0, h, 0, h}, dy[] = {h, h, 0, 0};
      for (int k = 0; k < 4; k++)
        kids[k] = std::make_unique<Node>(Node{x0 + dx[k], y0 + dy[k], h, depth + 1, {}, {}});
      for (const Point& p : points) kids[quadrant(p)]->points.push_back(p);
      points.clear();
    }
  };

  int capacity;
  std::unique_ptr<Node> root;
  std::set<Point> all;

  static bool inside(const Point& p, const Point& lo, const Point& hi) {
    return lo.first <= p.first && p.first <= hi.first && lo.second <= p.second &&
           p.second <= hi.second;
  }

  void query(const Node* x, const Point& lo, const Point& hi, std::vector<Point>& out) const {
    bool meets = lo.first < x->x0 + x->size && hi.first >= x->x0 &&
                 lo.second < x->y0 + x->size && hi.second >= x->y0;
    if (!meets) return;  // the square misses the rectangle
    if (!x->leaf()) {
      for (const auto& k : x->kids) query(k.get(), lo, hi, out);
      return;
    }
    for (const Point& p : x->points)
      if (inside(p, lo, hi)) out.push_back(p);
  }

  static std::pair<int, int> stats(const Node* x) {
    if (x->leaf()) return {1, x->depth};
    std::pair<int, int> r{1, 0};
    for (const auto& k : x->kids) {
      auto s = stats(k.get());
      r.first += s.first;
      r.second = std::max(r.second, s.second);
    }
    return r;
  }

 public:
  explicit QuadTree(int capacity, int side = 16)
      : capacity(capacity), root(std::make_unique<Node>(Node{0, 0, side, 0, {}, {}})) {}

  void insert(const Point& p) {
    if (!all.insert(p).second) return;  // already there
    Node* x = root.get();
    while (!x->leaf()) x = x->kids[x->quadrant(p)].get();
    x->points.push_back(p);
    while (static_cast<int>(x->points.size()) > capacity && x->size > 1) {
      x->split();
      x = x->kids[x->quadrant(p)].get();
    }
  }

  // Every point with lo <= p <= hi on both coordinates.
  std::vector<Point> query(const Point& lo, const Point& hi) const {
    std::vector<Point> out;
    query(root.get(), lo, hi, out);
    return out;
  }

  // {number of nodes, height}
  std::pair<int, int> stats() const { return stats(root.get()); }
};
