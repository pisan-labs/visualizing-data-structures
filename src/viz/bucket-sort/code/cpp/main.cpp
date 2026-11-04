// Test driver: "load v1 v2 ..." replaces the array; "sort lo hi d" sorts it with buckets over
// [lo, hi) and prints it with d decimals.
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "bucket_sort.hpp"

int main() {
  std::vector<double> a;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "load") {
      a.clear();
      double v = 0;
      while (words >> v) a.push_back(v);
    } else if (op == "sort") {
      double lo = 0, hi = 1;
      int d = 0;
      words >> lo >> hi >> d;
      bucket_sort(a, lo, hi);
      std::cout << std::fixed << std::setprecision(d);
      for (std::size_t i = 0; i < a.size(); i++) std::cout << (i ? " " : "") << a[i];
      std::cout << "\n";
    }
  }
  return 0;
}
