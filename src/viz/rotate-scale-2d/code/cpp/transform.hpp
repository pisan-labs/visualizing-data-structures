#pragma once
#include <cmath>
#include <vector>

struct Vec2 {
  double x, y;
};

// Rotate points counter-clockwise by degrees about c: p' = c + R (p - c).
inline std::vector<Vec2> rotate(const std::vector<Vec2>& points, double degrees, Vec2 c = {0, 0}) {
  const double theta = degrees * std::acos(-1.0) / 180;
  const double cs = std::cos(theta), sn = std::sin(theta);
  std::vector<Vec2> out;
  for (const Vec2& p : points) {
    double dx = p.x - c.x, dy = p.y - c.y;
    out.push_back({c.x + (cs * dx - sn * dy), c.y + (sn * dx + cs * dy)});
  }
  return out;
}

// Scale points by sx in x and sy in y about c: p' = c + S (p - c).
inline std::vector<Vec2> scale(const std::vector<Vec2>& points, double sx, double sy,
                               Vec2 c = {0, 0}) {
  std::vector<Vec2> out;
  for (const Vec2& p : points) out.push_back({c.x + sx * (p.x - c.x), c.y + sy * (p.y - c.y)});
  return out;
}
