#pragma once
#include <array>
#include <cmath>

// A rigid motion is a 3x3 matrix acting on (x, y, 1): [cos -sin tx; sin cos ty; 0 0 1].
using Mat = std::array<std::array<double, 3>, 3>;

struct Vec2 {
  double x, y;
};

// The product a b: apply b first, then a.
inline Mat multiply(const Mat& a, const Mat& b) {
  Mat out{};
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++)
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return out;
}

// Counter-clockwise about the origin.
inline Mat rotation(double degrees) {
  const double theta = degrees * std::acos(-1.0) / 180;
  const double c = std::cos(theta), s = std::sin(theta);
  return {{{c, -s, 0}, {s, c, 0}, {0, 0, 1}}};
}

inline Mat translation(double tx, double ty) { return {{{1, 0, tx}, {0, 1, ty}, {0, 0, 1}}}; }

// Slide c to the origin, rotate, slide back: T(c) R T(-c).
inline Mat rotation_about(double degrees, double cx, double cy) {
  return multiply(translation(cx, cy), multiply(rotation(degrees), translation(-cx, -cy)));
}

// Undo p' = R p + t with p = R^T p' - R^T t. No division needed.
inline Mat inverse(const Mat& m) {
  const double tx = m[0][2], ty = m[1][2];
  return {{{m[0][0], m[1][0], -(m[0][0] * tx + m[1][0] * ty)},
           {m[0][1], m[1][1], -(m[0][1] * tx + m[1][1] * ty)},
           {0, 0, 1}}};
}

inline Vec2 apply(const Mat& m, Vec2 p) {
  return {m[0][0] * p.x + m[0][1] * p.y + m[0][2], m[1][0] * p.x + m[1][1] * p.y + m[1][2]};
}
