// Test driver: "radii S" prints p for S with separators; "longest S"
// prints the longest palindromic substring of S.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "manacher.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, s;
    if (!(words >> op >> s)) continue;
    if (op == "radii") {
      const std::vector<int> p = radii(s);
      for (std::size_t k = 0; k < p.size(); k++) std::cout << (k ? " " : "") << p[k];
      std::cout << "\n";
    } else if (op == "longest") {
      std::cout << longest_palindrome(s) << "\n";
    }
  }
  return 0;
}
