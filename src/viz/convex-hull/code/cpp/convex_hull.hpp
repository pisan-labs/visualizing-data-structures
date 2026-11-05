#pragma once
#include <algorithm>
#include <vector>

struct Point {
  long x, y;
  bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};

// Positive if a -> b -> c turns left, negative if right, 0 if collinear.
inline long turn(const Point& a, const Point& b, const Point& c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

inline long dist2(const Point& a, const Point& b) {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

// Corners of the convex hull, counter-clockwise from the lowest point.
inline std::vector<Point> graham_scan(std::vector<Point> pts) {
  std::vector<Point> stack;
  if (pts.empty()) return stack;
  auto lowest = [](const Point& a, const Point& b) {
    return a.y < b.y || (a.y == b.y && a.x < b.x);
  };
  std::sort(pts.begin(), pts.end(), lowest);
  pts.erase(std::unique(pts.begin(), pts.end()), pts.end());  // drop duplicates
  const Point p0 = pts[0];
  std::sort(pts.begin() + 1, pts.end(), [&](const Point& a, const Point& b) {
    long t = turn(p0, a, b);
    return t != 0 ? t > 0 : dist2(p0, a) < dist2(p0, b);
  });
  for (const Point& p : pts) {
    // Pop every point that does not make a left turn on the way to p.
    while (stack.size() >= 2 && turn(stack[stack.size() - 2], stack.back(), p) <= 0) {
      stack.pop_back();
    }
    stack.push_back(p);
  }
  return stack;
}
