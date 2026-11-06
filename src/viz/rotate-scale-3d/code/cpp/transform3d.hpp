#pragma once
#include <array>
#include <cmath>

// 3x3 matrices act on column vectors (x, y, z): p' = M p.
using Mat = std::array<std::array<double, 3>, 3>;
using Vec3 = std::array<double, 3>;

// The product a b: apply b first, then a.
inline Mat multiply(const Mat& a, const Mat& b) {
  Mat out{};
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++)
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return out;
}

// Counter-clockwise about the axis, seen with the axis pointing at you.
inline Mat rotation(char axis, double degrees) {
  const double theta = degrees * std::acos(-1.0) / 180;
  const double c = std::cos(theta), s = std::sin(theta);
  if (axis == 'x') return {{{1, 0, 0}, {0, c, -s}, {0, s, c}}};
  if (axis == 'y') return {{{c, 0, s}, {0, 1, 0}, {-s, 0, c}}};
  return {{{c, -s, 0}, {s, c, 0}, {0, 0, 1}}};
}

inline Mat scaling(double sx, double sy, double sz) {
  return {{{sx, 0, 0}, {0, sy, 0}, {0, 0, sz}}};
}

inline Vec3 apply(const Mat& m, const Vec3& p) {
  Vec3 out{};
  for (int i = 0; i < 3; i++) out[i] = m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2];
  return out;
}
