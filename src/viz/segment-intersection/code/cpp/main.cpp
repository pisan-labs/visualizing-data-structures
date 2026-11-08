// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "segments.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op) || op != "segments") continue;
    std::vector<Seg> segs;
    Seg s;
    while (words >> s.x1 >> s.y1 >> s.x2 >> s.y2) segs.push_back(s);
    std::cout << (anySegmentsIntersect(segs) ? "yes" : "no") << "\n";
  }
  return 0;
}
