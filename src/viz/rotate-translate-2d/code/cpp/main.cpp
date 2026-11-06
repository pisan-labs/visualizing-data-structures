// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "motion.hpp"

// Two decimals, rounded half up the same way in every language.
std::string fixed2(double x) {
  long r = static_cast<long>(std::floor(x * 100 + 0.5));
  long a = r < 0 ? -r : r;
  char buf[32];
  std::snprintf(buf, sizeof buf, "%s%ld.%02ld", r < 0 ? "-" : "", a / 100, a % 100);
  return buf;
}

std::string show(const Mat& m, const std::vector<Vec2>& shape) {
  std::string s;
  for (std::size_t i = 0; i < shape.size(); i++) {
    Vec2 q = apply(m, shape[i]);
    s += (i ? " " : "") + fixed2(q.x) + "," + fixed2(q.y);
  }
  return s;
}

int main() {
  std::vector<Vec2> shape;
  Mat m = translation(0, 0);
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<double> n;
    double v;
    while (words >> v) n.push_back(v);
    if (op == "shape") {
      shape.clear();
      for (std::size_t i = 0; i + 1 < n.size(); i += 2) shape.push_back({n[i], n[i + 1]});
      m = translation(0, 0);
      continue;
    }
    if (op == "order") {
      Mat first = multiply(translation(n[1], n[2]), multiply(rotation(n[0]), m));
      Mat second = multiply(rotation(n[0]), multiply(translation(n[1], n[2]), m));
      std::cout << show(first, shape) << " | " << show(second, shape) << "\n";
      continue;
    }
    if (op == "rotate") {
      m = multiply(rotation(n[0]), m);
    } else if (op == "translate") {
      m = multiply(translation(n[0], n[1]), m);
    } else if (op == "about") {
      m = multiply(rotation_about(n[0], n[1], n[2]), m);
    } else if (op == "invert") {
      m = multiply(inverse(m), m);
    } else {
      continue;
    }
    std::cout << show(m, shape) << "\n";
  }
  return 0;
}
