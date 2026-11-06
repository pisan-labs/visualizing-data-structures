// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "transform3d.hpp"

// Two decimals, rounded half up the same way in every language.
std::string fixed2(double x) {
  long r = static_cast<long>(std::floor(x * 100 + 0.5));
  long a = r < 0 ? -r : r;
  char buf[32];
  std::snprintf(buf, sizeof buf, "%s%ld.%02ld", r < 0 ? "-" : "", a / 100, a % 100);
  return buf;
}

std::string show(const Mat& m, const std::vector<Vec3>& shape) {
  std::string s;
  for (std::size_t i = 0; i < shape.size(); i++) {
    Vec3 q = apply(m, shape[i]);
    s += (i ? " " : "") + fixed2(q[0]) + "," + fixed2(q[1]) + "," + fixed2(q[2]);
  }
  return s;
}

int main() {
  std::vector<Vec3> shape;
  Mat m = scaling(1, 1, 1);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "rotate") {
      char axis;
      double deg;
      words >> axis >> deg;
      m = multiply(rotation(axis, deg), m);
      std::cout << show(m, shape) << "\n";
      continue;
    }
    std::vector<double> n;
    double v;
    while (words >> v) n.push_back(v);
    if (op == "shape") {
      shape.clear();
      for (std::size_t i = 0; i + 2 < n.size(); i += 3) shape.push_back({n[i], n[i + 1], n[i + 2]});
      m = scaling(1, 1, 1);
    } else if (op == "scale") {
      m = multiply(scaling(n[0], n[1], n[2]), m);
      std::cout << show(m, shape) << "\n";
    } else if (op == "order") {
      Mat rx = rotation('x', n[0]), ry = rotation('y', n[0]);
      Mat first = multiply(ry, multiply(rx, m));
      Mat second = multiply(rx, multiply(ry, m));
      std::cout << show(first, shape) << " | " << show(second, shape) << "\n";
    }
  }
  return 0;
}
