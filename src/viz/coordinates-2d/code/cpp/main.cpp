// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "frame.hpp"

// Two decimals, rounded half up the same way in every language.
std::string fixed2(double x) {
  long r = static_cast<long>(std::floor(x * 100 + 0.5));
  long a = r < 0 ? -r : r;
  char buf[32];
  std::snprintf(buf, sizeof buf, "%s%ld.%02ld", r < 0 ? "-" : "", a / 100, a % 100);
  return buf;
}

int main() {
  std::unique_ptr<Frame> frame;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "frame") {
      Vec2 o, u, v;
      words >> o.x >> o.y >> u.x >> u.y >> v.x >> v.y;
      frame = std::make_unique<Frame>(o, u, v);
    } else if (op == "local" || op == "world") {
      Vec2 q;
      words >> q.x >> q.y;
      Vec2 p = op == "local" ? frame->to_local(q) : frame->to_world(q);
      std::cout << fixed2(p.x) << " " << fixed2(p.y) << "\n";
    }
  }
  return 0;
}
