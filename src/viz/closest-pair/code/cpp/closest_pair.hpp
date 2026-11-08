#pragma once
#include <algorithm>
#include <climits>
#include <vector>

struct Point {
  long x, y;
};

inline long dist2(const Point& p, const Point& q) {
  return (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
}

// px holds the points sorted by x, py the same points sorted by y; each point has an index id.
struct Tagged {
  Point p;
  int id;
};

inline long closest(const std::vector<Tagged>& px, const std::vector<Tagged>& py) {
  std::size_t n = px.size();
  long d = LONG_MAX;
  if (n <= 3) {  // brute force the base case
    for (std::size_t i = 0; i < n; i++)
      for (std::size_t j = i + 1; j < n; j++) d = std::min(d, dist2(px[i].p, px[j].p));
    return d;
  }
  std::size_t mid = n / 2;
  long xm = px[mid].p.x;  // the dividing line x = xm
  std::vector<Tagged> left(px.begin(), px.begin() + mid), right(px.begin() + mid, px.end());
  int most = 0;
  for (const Tagged& t : px) most = std::max(most, t.id);
  std::vector<bool> inLeft(most + 1, false);
  for (const Tagged& t : left) inLeft[t.id] = true;
  std::vector<Tagged> yl, yr;
  for (const Tagged& t : py) (inLeft[t.id] ? yl : yr).push_back(t);
  d = std::min(closest(left, yl), closest(right, yr));
  std::vector<Point> strip;  // within delta of the line, by y
  for (const Tagged& t : py)
    if ((t.p.x - xm) * (t.p.x - xm) < d) strip.push_back(t.p);
  for (std::size_t i = 0; i < strip.size(); i++) {
    for (std::size_t j = i + 1; j < strip.size(); j++) {
      long dy = strip[j].y - strip[i].y;
      if (dy * dy >= d) break;  // at most 7 points get this far
      d = std::min(d, dist2(strip[i], strip[j]));
    }
  }
  return d;
}

// The smallest squared distance between two of the points (at least two).
inline long closestPair(const std::vector<Point>& points) {
  std::vector<Tagged> px, py;
  for (std::size_t i = 0; i < points.size(); i++) px.push_back({points[i], static_cast<int>(i)});
  py = px;
  std::sort(px.begin(), px.end(), [](const Tagged& a, const Tagged& b) {
    return a.p.x != b.p.x ? a.p.x < b.p.x : a.p.y != b.p.y ? a.p.y < b.p.y : a.id < b.id;
  });
  std::sort(py.begin(), py.end(), [](const Tagged& a, const Tagged& b) {
    return a.p.y != b.p.y ? a.p.y < b.p.y : a.p.x != b.p.x ? a.p.x < b.p.x : a.id < b.id;
  });
  return closest(px, py);
}
