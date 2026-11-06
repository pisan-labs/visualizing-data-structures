// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "suffix_array.hpp"

static std::string join(const std::vector<int>& xs) {
  std::string out;
  for (int x : xs) out += (out.empty() ? "" : " ") + std::to_string(x);
  return out;
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, t;
    if (!(words >> op >> t)) continue;
    std::vector<int> sa = suffixArray(t);
    std::vector<int> lcp = lcpArray(t, sa);
    if (op == "build") {
      std::cout << join(sa) << " | " << join(lcp) << '\n';
    } else if (op == "search") {
      std::string p;
      words >> p;
      std::vector<int> found = search(t, sa, p);
      std::cout << (found.empty() ? "none" : join(found)) << '\n';
    } else if (op == "repeat") {
      std::string r = longestRepeat(t, sa, lcp);
      std::cout << (r.empty() ? "none" : r) << '\n';
    }
  }
}
