// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>

#include "growth.hpp"

int main() {
  const std::map<std::string, long long (*)(int)> fns = {
      {"constant", constant},     {"logarithmic", logarithmic}, {"linear", linear},
      {"linearithmic", linearithmic}, {"quadratic", quadratic},  {"exponential", exponential},
      {"factorial", factorial},
  };
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, name;
    int n = 0;
    if (!(words >> op >> name >> n) || op != "count") continue;
    std::cout << fns.at(name)(n) << "\n";
  }
  return 0;
}
