// Test driver: reads one operation per line, prints one result per line.
#include <algorithm>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "count_min_sketch.hpp"

int main() {
  std::unique_ptr<CountMinSketch> cms;
  std::vector<int> seen;  // candidates for heavy hitters
  int d = 0, w = 0, n = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0, b = 0;
    words >> a >> b;
    if (op == "new") {
      d = a;
      w = b;
      cms = std::make_unique<CountMinSketch>(d, w);
    } else if (op == "add") {
      cms->add(a);
      n++;
      if (std::find(seen.begin(), seen.end(), a) == seen.end()) seen.push_back(a);
      for (int i = 0; i < cms->rows(); i++) std::cout << (i ? " " : "") << cms->column(i, a);
      std::cout << "\n";
    } else if (op == "estimate") {
      std::cout << cms->estimate(a) << "\n";
    } else if (op == "heavy") {
      std::string row;
      for (int x : cms->heavyHitters(seen, n, 20)) {
        if (cms->estimate(x) > 0) row += (row.empty() ? "" : " ") + std::to_string(x);
      }
      std::cout << (row.empty() ? "none" : row) << "\n";
    } else if (op == "clear") {
      cms = std::make_unique<CountMinSketch>(d, w);
      seen.clear();
      n = 0;
      std::cout << "ok\n";
    }
  }
  return 0;
}
