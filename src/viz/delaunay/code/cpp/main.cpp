// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "delaunay.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op) || op != "delaunay") continue;
    std::vector<Pt> points;
    long long x, y;
    while (words >> x >> y) points.push_back({x, y});
    std::vector<std::string> rows;
    for (auto tri : triangulate(points)) {
      std::sort(tri.begin(), tri.end());
      std::string row;
      for (int i = 0; i < 3; i++)
        row += (i ? " " : "") + std::to_string(tri[i][0]) + "," + std::to_string(tri[i][1]);
      rows.push_back(row);
    }
    std::sort(rows.begin(), rows.end());
    if (rows.empty()) std::cout << "none";
    for (std::size_t i = 0; i < rows.size(); i++) std::cout << (i ? " | " : "") << rows[i];
    std::cout << "\n";
  }
  return 0;
}
