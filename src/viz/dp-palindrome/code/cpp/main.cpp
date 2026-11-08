// Test driver: "length s" prints the length of the longest palindromic subsequence of s;
// "palindrome s" prints the length and one such palindrome.
#include <iostream>
#include <sstream>
#include <string>

#include "palindrome.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, s;
    if (!(words >> op >> s)) continue;
    if (op == "length") std::cout << lps_table(s)[0][s.size() - 1] << "\n";
    if (op == "palindrome") {
      const std::string p = longest_palindrome(s);
      std::cout << p.size() << ' ' << p << "\n";
    }
  }
  return 0;
}
