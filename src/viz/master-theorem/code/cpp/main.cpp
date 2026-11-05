// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>

#include "master.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int a = 0, b = 0, d = 0;
    long long last = 0;
    if (!(words >> op >> a >> b >> d >> last)) continue;
    if (op == "case") {
      std::cout << master_case(a, b, d, static_cast<int>(last)) << "\n";
    } else if (op == "T") {
      std::cout << T(a, b, d, last) << "\n";
    }
  }
  return 0;
}
