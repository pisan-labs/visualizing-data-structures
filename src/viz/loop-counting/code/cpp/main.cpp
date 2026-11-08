// Test driver: reads one operation per line, prints one result per line. "triangle 8" prints
// how many times the triangle's innermost line runs for n = 8. "search 8 first" searches
// a = [1..8] for x placed first, in the middle, or missing.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "loops.hpp"

long long searchCase(int n, const std::string& where) {
  std::vector<int> a(n);
  for (int i = 0; i < n; i++) a[i] = i + 1;
  int x = where == "first" ? a[0] : where == "middle" ? a[(n - 1) / 2] : n + 1;
  return search(a, x);
}

int main() {
  const std::map<std::string, long long (*)(int)> patterns = {
      {"single", single},     {"nested", nested},       {"triangle", triangle},
      {"pairs", pairs},       {"sequence", sequence},   {"halving", halving},
      {"sqrt", squareRoot},   {"doubling", doubling},   {"geometric", geometric},
      {"triple", triple},
  };
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string name, where;
    int n = 0;
    if (!(words >> name >> n)) continue;
    if (name == "search") {
      words >> where;
      std::cout << searchCase(n, where) << "\n";
    } else {
      std::cout << patterns.at(name)(n) << "\n";
    }
  }
  return 0;
}
