#pragma once
#include <algorithm>
#include <array>
#include <vector>

// A segment from (x1, y1) to (x2, y2) with x1 < x2 (no vertical segments).
struct Seg {
  long x1, y1, x2, y2;
};

inline long turn(long ax, long ay, long bx, long by, long cx, long cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

inline bool onSegment(long rx, long ry, long ax, long ay, long bx, long by) {
  return std::min(ax, bx) <= rx && rx <= std::max(ax, bx) && std::min(ay, by) <= ry &&
         ry <= std::max(ay, by);
}

// CLRS SEGMENTS-INTERSECT: do s and t share a point?
inline bool intersects(const Seg& s, const Seg& t) {
  long d1 = turn(t.x1, t.y1, t.x2, t.y2, s.x1, s.y1);
  long d2 = turn(t.x1, t.y1, t.x2, t.y2, s.x2, s.y2);
  long d3 = turn(s.x1, s.y1, s.x2, s.y2, t.x1, t.y1);
  long d4 = turn(s.x1, s.y1, s.x2, s.y2, t.x2, t.y2);
  auto sign = [](long v) { return (v > 0) - (v < 0); };
  if (sign(d1) * sign(d2) < 0 && sign(d3) * sign(d4) < 0) return true;
  return (d1 == 0 && onSegment(s.x1, s.y1, t.x1, t.y1, t.x2, t.y2)) ||
         (d2 == 0 && onSegment(s.x2, s.y2, t.x1, t.y1, t.x2, t.y2)) ||
         (d3 == 0 && onSegment(t.x1, t.y1, s.x1, s.y1, s.x2, s.y2)) ||
         (d4 == 0 && onSegment(t.x2, t.y2, s.x1, s.y1, s.x2, s.y2));
}

// Is s below t on the sweep line at x? Ties: the smaller slope is lower just to the right.
inline bool below(const Seg& s, const Seg& t, long x) {
  long ys = s.y1 * (s.x2 - s.x1) + (x - s.x1) * (s.y2 - s.y1);
  long yt = t.y1 * (t.x2 - t.x1) + (x - t.x1) * (t.y2 - t.y1);
  long lhs = ys * (t.x2 - t.x1), rhs = yt * (s.x2 - s.x1);
  if (lhs != rhs) return lhs < rhs;
  return (s.y2 - s.y1) * (t.x2 - t.x1) < (t.y2 - t.y1) * (s.x2 - s.x1);
}

inline bool anySegmentsIntersect(const std::vector<Seg>& segs) {
  std::vector<std::array<long, 4>> events;  // {x, 0 = left end / 1 = right end, y, index}
  for (std::size_t i = 0; i < segs.size(); i++) {
    long id = static_cast<long>(i);
    events.push_back({segs[i].x1, 0, segs[i].y1, id});
    events.push_back({segs[i].x2, 1, segs[i].y2, id});
  }
  std::sort(events.begin(), events.end());
  std::vector<std::size_t> status;  // bottom to top
  for (const auto& e : events) {
    std::size_t i = static_cast<std::size_t>(e[3]);
    const Seg& s = segs[i];
    if (e[1] == 0) {
      std::size_t k = 0;
      while (k < status.size() && below(segs[status[k]], s, e[0])) k++;
      status.insert(status.begin() + static_cast<long>(k), i);
      if (k > 0 && intersects(s, segs[status[k - 1]])) return true;
      if (k + 1 < status.size() && intersects(s, segs[status[k + 1]])) return true;
    } else {
      std::size_t k = static_cast<std::size_t>(
          std::find(status.begin(), status.end(), i) - status.begin());
      if (k > 0 && k + 1 < status.size() && intersects(segs[status[k - 1]], segs[status[k + 1]]))
        return true;
      status.erase(status.begin() + static_cast<long>(k));
    }
  }
  return false;
}
