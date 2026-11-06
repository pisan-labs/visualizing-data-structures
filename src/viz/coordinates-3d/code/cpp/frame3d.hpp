#pragma once
#include <array>
#include <cmath>
#include <stdexcept>

using Vec3 = std::array<double, 3>;

inline double dot(const Vec3& a, const Vec3& b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

inline Vec3 cross(const Vec3& a, const Vec3& b) {
  return {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
}

// A frame is an origin o and three axes u, v, w, all in world coordinates.
struct Frame3d {
  Vec3 o, u, v, w;

  // The world point with frame coordinates q = (a, b, c): o + a u + b v + c w.
  Vec3 to_world(const Vec3& q) const {
    Vec3 p{};
    for (int i = 0; i < 3; i++) p[i] = o[i] + q[0] * u[i] + q[1] * v[i] + q[2] * w[i];
    return p;
  }

  // p in the frame's coordinates: M^-1 (p - o), with M^-1 built from cross products.
  Vec3 to_local(const Vec3& p) const {
    const double det = dot(u, cross(v, w));
    if (std::fabs(det) < 1e-9) throw std::domain_error("the axes lie in one plane");
    const Vec3 d{p[0] - o[0], p[1] - o[1], p[2] - o[2]};
    return {dot(d, cross(v, w)) / det, dot(d, cross(w, u)) / det, dot(d, cross(u, v)) / det};
  }

  // The shortcut for perpendicular unit axes: M^-1 = M^T, so three dot products.
  Vec3 to_local_orthonormal(const Vec3& p) const {
    const Vec3 d{p[0] - o[0], p[1] - o[1], p[2] - o[2]};
    return {dot(u, d), dot(v, d), dot(w, d)};
  }
};
