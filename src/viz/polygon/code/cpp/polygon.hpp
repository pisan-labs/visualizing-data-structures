#pragma once
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

struct Point {
  long x, y;
};
using Poly = std::vector<Point>;

// Positive if a -> b -> c turns left, negative if right, 0 if collinear.
inline long turn(const Point& a, const Point& b, const Point& c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

// Twice the signed area (shoelace): positive when counter-clockwise.
inline long area2(const Poly& p) {
  long sum = 0;
  for (std::size_t i = 0; i < p.size(); i++) {
    const Point& a = p[i];
    const Point& b = p[(i + 1) % p.size()];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

// "ccw", "cw" or "degenerate", from the turn at the lowest vertex.
inline std::string orientation(const Poly& p) {
  std::size_t n = p.size(), k = 0;
  for (std::size_t i = 1; i < n; i++) {
    if (p[i].y < p[k].y || (p[i].y == p[k].y && p[i].x < p[k].x)) k = i;
  }
  long t = turn(p[(k + n - 1) % n], p[k], p[(k + 1) % n]);
  return t > 0 ? "ccw" : t < 0 ? "cw" : "degenerate";
}

// Every turn goes the same way, and the turns add up to one full circle.
inline bool is_convex(const Poly& p) {
  std::size_t n = p.size();
  int sign = 0;
  double total = 0;
  for (std::size_t i = 0; i < n; i++) {
    const Point& a = p[(i + n - 1) % n];
    const Point& b = p[i];
    const Point& c = p[(i + 1) % n];
    long t = turn(a, b, c);
    long d = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if ((t > 0 && sign < 0) || (t < 0 && sign > 0) || (t == 0 && d < 0)) return false;
    if (sign == 0 && t != 0) sign = t > 0 ? 1 : -1;
    total += std::atan2(static_cast<double>(t), static_cast<double>(d));
  }
  const double pi = std::acos(-1.0);
  return std::lround(std::fabs(total) / (2 * pi)) == 1;
}

inline bool on_segment(const Point& a, const Point& b, const Point& q) {
  return turn(a, b, q) == 0 && std::min(a.x, b.x) <= q.x && q.x <= std::max(a.x, b.x) &&
         std::min(a.y, b.y) <= q.y && q.y <= std::max(a.y, b.y);
}

// "inside", "outside" or "boundary", by counting crossings of a ray to the right.
inline std::string ray_cast(const Poly& p, const Point& q) {
  bool inside = false;
  for (std::size_t i = 0; i < p.size(); i++) {
    const Point& a = p[i];
    const Point& b = p[(i + 1) % p.size()];
    if (on_segment(a, b, q)) return "boundary";
    if ((a.y > q.y) != (b.y > q.y)) {
      double x = a.x + static_cast<double>(q.y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (q.x < x) inside = !inside;
    }
  }
  return inside ? "inside" : "outside";
}

// "inside", "outside" or "boundary", by the nonzero winding rule.
inline std::string winding_number(const Poly& p, const Point& q) {
  int w = 0;
  for (std::size_t i = 0; i < p.size(); i++) {
    const Point& a = p[i];
    const Point& b = p[(i + 1) % p.size()];
    if (on_segment(a, b, q)) return "boundary";
    if (a.y <= q.y && q.y < b.y && turn(a, b, q) > 0) w++;
    else if (b.y <= q.y && q.y < a.y && turn(a, b, q) < 0) w--;
  }
  return w != 0 ? "inside" : "outside";
}
