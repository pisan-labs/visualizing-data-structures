// Test driver: "bwt T" prints the transform of T + "$"; "inverse L" prints
// the text back. "bwtindex T" prints "L index"; "inverseindex L index"
// prints the text, for the version with no end marker.
#include <iostream>
#include <sstream>
#include <string>

#include "bwt.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, a;
    int index = 0;
    words >> op >> a;
    if (op == "bwt") {
      std::cout << bwt(a) << "\n";
    } else if (op == "inverse") {
      std::cout << inverse_bwt(a) << "\n";
    } else if (op == "bwtindex") {
      const auto [last, row] = bwt_index(a);
      std::cout << last << " " << row << "\n";
    } else if (op == "inverseindex" && words >> index) {
      std::cout << inverse_bwt_index(a, index) << "\n";
    }
  }
  return 0;
}
