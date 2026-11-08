// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "closest_pair.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op) || op != "closest") continue;
    std::vector<Point> points;
    long x, y;
    while (words >> x >> y) points.push_back({x, y});
    if (points.size() < 2) std::cout << "none\n";
    else std::cout << closestPair(points) << "\n";
  }
  return 0;
}
