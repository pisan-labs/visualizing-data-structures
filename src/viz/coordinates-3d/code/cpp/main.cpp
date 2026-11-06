// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "frame3d.hpp"

// Two decimals, rounded half up the same way in every language.
std::string fixed2(double x) {
  long r = static_cast<long>(std::floor(x * 100 + 0.5));
  long a = r < 0 ? -r : r;
  char buf[32];
  std::snprintf(buf, sizeof buf, "%s%ld.%02ld", r < 0 ? "-" : "", a / 100, a % 100);
  return buf;
}

std::string show(const Vec3& p) { return fixed2(p[0]) + " " + fixed2(p[1]) + " " + fixed2(p[2]); }

int main() {
  Frame3d frame{};
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<double> n;
    double v;
    while (words >> v) n.push_back(v);
    if (op == "frame" && n.size() == 12) {
      frame = {{n[0], n[1], n[2]}, {n[3], n[4], n[5]}, {n[6], n[7], n[8]}, {n[9], n[10], n[11]}};
    } else if (op == "local") {
      std::cout << show(frame.to_local({n[0], n[1], n[2]})) << "\n";
    } else if (op == "world") {
      std::cout << show(frame.to_world({n[0], n[1], n[2]})) << "\n";
    }
  }
  return 0;
}
