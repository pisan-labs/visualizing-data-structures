// Test driver: reads "reverse s" or "swap s", one per line, and prints each reversed string.
#include <iostream>
#include <sstream>
#include <string>

#include "reverse.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, s;
    if (!(words >> op >> s)) continue;
    if (op == "reverse") {
      std::cout << reverse(s) << "\n";
    } else if (op == "swap") {
      reverse_in_place(s, 0, static_cast<int>(s.size()) - 1);
      std::cout << s << "\n";
    }
  }
  return 0;
}
