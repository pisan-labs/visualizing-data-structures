// Test driver: "length x y" prints the LCS length; "lcs x y" prints the length and one LCS.
#include <iostream>
#include <sstream>
#include <string>

#include "lcs.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, x, y;
    if (!(words >> op >> x >> y)) continue;
    if (op == "length") {
      std::cout << lcs_table(x, y)[x.size()][y.size()] << "\n";
    } else if (op == "lcs") {
      const std::string s = lcs(x, y);
      std::cout << s.size();
      if (!s.empty()) std::cout << ' ' << s;
      std::cout << "\n";
    }
  }
  return 0;
}
