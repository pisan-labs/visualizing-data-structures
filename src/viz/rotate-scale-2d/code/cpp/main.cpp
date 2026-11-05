// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "transform.hpp"

// Two decimals, rounded half up the same way in every language.
std::string fixed2(double x) {
  long r = static_cast<long>(std::floor(x * 100 + 0.5));
  long a = r < 0 ? -r : r;
  char buf[32];
  std::snprintf(buf, sizeof buf, "%s%ld.%02ld", r < 0 ? "-" : "", a / 100, a % 100);
  return buf;
}

std::string show(const std::vector<Vec2>& points) {
  std::string s;
  for (std::size_t i = 0; i < points.size(); i++) {
    s += (i ? " " : "") + fixed2(points[i].x) + "," + fixed2(points[i].y);
  }
  return s;
}

int main() {
  std::vector<Vec2> points;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<double> n;
    double v;
    while (words >> v) n.push_back(v);
    if (op == "shape") {
      points.clear();
      for (std::size_t i = 0; i + 1 < n.size(); i += 2) points.push_back({n[i], n[i + 1]});
    } else if (op == "rotate") {
      points = rotate(points, n[0], {n[1], n[2]});
      std::cout << show(points) << "\n";
    } else if (op == "scale") {
      points = scale(points, n[0], n[1], {n[2], n[3]});
      std::cout << show(points) << "\n";
    } else if (op == "order") {
      Vec2 c{n[3], n[4]};
      auto first = scale(rotate(points, n[0], c), n[1], n[2], c);
      auto second = rotate(scale(points, n[1], n[2], c), n[0], c);
      std::cout << show(first) << " | " << show(second) << "\n";
    }
  }
  return 0;
}
