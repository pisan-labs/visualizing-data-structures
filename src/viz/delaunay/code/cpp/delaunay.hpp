#pragma once
#include <array>
#include <set>
#include <utility>
#include <vector>

using Pt = std::array<long long, 2>;

const long long FAR = 10000;  // the super triangle's corners, far enough to act like infinity

// Positive if d is inside the circle through a, b, c (counter-clockwise). Exact in 64 bits.
inline long long inCircle(const Pt& a, const Pt& b, const Pt& c, const Pt& d) {
  long long adx = a[0] - d[0], ady = a[1] - d[1];
  long long bdx = b[0] - d[0], bdy = b[1] - d[1];
  long long cdx = c[0] - d[0], cdy = c[1] - d[1];
  return (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
         (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
         (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
}

// Bowyer-Watson: Delaunay triangles of distinct points, each as three points.
inline std::vector<std::array<Pt, 3>> triangulate(const std::vector<Pt>& points) {
  std::vector<Pt> pts = {{-FAR, -FAR}, {FAR, -FAR}, {0, FAR}};
  pts.insert(pts.end(), points.begin(), points.end());
  std::vector<std::array<int, 3>> tris = {{0, 1, 2}};  // vertex indices, counter-clockwise
  for (int k = 3; k < static_cast<int>(pts.size()); k++) {
    const Pt& p = pts[k];
    std::vector<std::array<int, 3>> bad, keep;
    for (const auto& t : tris) (inCircle(pts[t[0]], pts[t[1]], pts[t[2]], p) > 0 ? bad : keep).push_back(t);
    std::set<std::pair<int, int>> edges;
    for (const auto& t : bad)
      for (int i = 0; i < 3; i++) edges.insert({t[i], t[(i + 1) % 3]});
    for (const auto& t : bad)
      for (int i = 0; i < 3; i++) {
        int u = t[i], w = t[(i + 1) % 3];
        if (!edges.count({w, u})) keep.push_back({u, w, k});  // an unshared edge
      }
    tris = keep;
  }
  std::vector<std::array<Pt, 3>> out;
  for (const auto& t : tris)
    if (t[0] >= 3 && t[1] >= 3 && t[2] >= 3) out.push_back({pts[t[0]], pts[t[1]], pts[t[2]]});
  return out;
}
