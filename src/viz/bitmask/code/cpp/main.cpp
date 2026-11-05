// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "bitmask.hpp"

static void print(const std::vector<unsigned>& xs) {
  for (std::size_t i = 0; i < xs.size(); i++) std::cout << (i ? " " : "") << xs[i];
  std::cout << "\n";
}

int main() {
  unsigned x = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    int arg = 0;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "load") {
      x = static_cast<unsigned>(arg);
      std::cout << x << "\n";
    } else if (op == "set") {
      x = set_bit(x, arg);
      std::cout << x << "\n";
    } else if (op == "clear") {
      x = clear_bit(x, arg);
      std::cout << x << "\n";
    } else if (op == "toggle") {
      x = toggle_bit(x, arg);
      std::cout << x << "\n";
    } else if (op == "test") {
      std::cout << test_bit(x, arg) << "\n";
    } else if (op == "lowbit") {
      std::cout << lowest_bit(x) << "\n";
    } else if (op == "popcount") {
      std::cout << popcount(x) << "\n";
    } else if (op == "subsets") {
      print(subsets(arg));
    } else if (op == "submasks") {
      print(submasks(x));
    }
  }
  return 0;
}
