// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "convex_hull.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op) || op != "hull") continue;
    std::vector<Point> points;
    long x, y;
    while (words >> x >> y) points.push_back({x, y});
    std::vector<Point> hull = graham_scan(points);
    if (hull.empty()) std::cout << "empty";
    for (std::size_t i = 0; i < hull.size(); i++) {
      std::cout << (i ? " " : "") << hull[i].x << "," << hull[i].y;
    }
    std::cout << "\n";
  }
  return 0;
}
