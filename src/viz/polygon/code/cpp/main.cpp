// Test driver: reads one operation per line, prints one result per line.
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>

#include "polygon.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    Point q{0, 0};
    if (op == "inside" || op == "winding") words >> q.x >> q.y;
    Poly p;
    long x, y;
    while (words >> x >> y) p.push_back({x, y});
    if (op == "area") {
      long s = std::labs(area2(p));
      std::cout << s / 2 << (s % 2 ? ".5" : "") << "\n";
    } else if (op == "orient") {
      std::cout << orientation(p) << "\n";
    } else if (op == "convex") {
      std::cout << (is_convex(p) ? "yes" : "no") << "\n";
    } else if (op == "inside") {
      std::cout << ray_cast(p, q) << "\n";
    } else if (op == "winding") {
      std::cout << winding_number(p, q) << "\n";
    }
  }
  return 0;
}
