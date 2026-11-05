#pragma once
#include <stdexcept>

struct Vec2 {
  double x, y;
};

// A 2D frame: an origin o and axes u, v, all in world coordinates.
class Frame {
 public:
  Frame(Vec2 o, Vec2 u, Vec2 v) : o_(o), u_(u), v_(v), det_(u.x * v.y - v.x * u.y) {
    if (det_ == 0) throw std::invalid_argument("the axes are parallel");
  }

  // World point of the frame coordinates q = (a, b): o + a*u + b*v.
  Vec2 to_world(Vec2 q) const {
    return {o_.x + q.x * u_.x + q.y * v_.x, o_.y + q.x * u_.y + q.y * v_.y};
  }

  // Frame coordinates of the world point p: M^-1 (p - o), by Cramer's rule.
  Vec2 to_local(Vec2 p) const {
    double dx = p.x - o_.x, dy = p.y - o_.y;
    return {(dx * v_.y - v_.x * dy) / det_, (u_.x * dy - dx * u_.y) / det_};
  }

 private:
  Vec2 o_, u_, v_;
  double det_;
};
