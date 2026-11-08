// Test driver: reads one operation per line, prints one result per line.
#include <cmath>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "hyperloglog.hpp"

int main() {
  std::unique_ptr<HyperLogLog> hll;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0;
    words >> a;
    if (op == "new") {
      hll = std::make_unique<HyperLogLog>(a);
    } else if (op == "add") {
      auto [j, rho] = hll->add(a);
      std::cout << j << " " << rho << "\n";
    } else if (op == "estimate") {
      std::cout << static_cast<long long>(std::floor(hll->estimate() + 0.5)) << "\n";
    } else if (op == "clear") {
      hll = std::make_unique<HyperLogLog>(hll->indexBits());
      std::cout << "ok\n";
    }
  }
  return 0;
}
