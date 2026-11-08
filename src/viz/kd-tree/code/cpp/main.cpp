// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "kd_tree.hpp"

int main() {
  KdTree tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<long> n;
    long v;
    while (words >> v) n.push_back(v);
    if (op == "insert") {
      tree.insert({n[0], n[1]});
    } else if (op == "clear") {
      tree = KdTree();
    } else if (op == "nearest") {
      long d2;
      const Point* p = tree.nearest({n[0], n[1]}, d2);
      if (p) std::cout << p->x << "," << p->y << " " << d2 << "\n";
      else std::cout << "empty\n";
    } else if (op == "range") {
      std::vector<Point> pts = tree.range({n[0], n[1]}, {n[2], n[3]});
      std::sort(pts.begin(), pts.end(), [](const Point& a, const Point& b) {
        return a.x != b.x ? a.x < b.x : a.y < b.y;
      });
      if (pts.empty()) std::cout << "none";
      for (std::size_t i = 0; i < pts.size(); i++)
        std::cout << (i ? " " : "") << pts[i].x << "," << pts[i].y;
      std::cout << "\n";
    }
  }
  return 0;
}
