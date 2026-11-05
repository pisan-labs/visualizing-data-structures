// Test driver: each line "search T P" prints the shifts where P occurs
// in T, separated by spaces, or "none".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "horspool.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, text, pattern;
    if (!(words >> op >> text >> pattern) || op != "search") continue;
    const std::vector<int> found = horspool_search(text, pattern);
    if (found.empty()) {
      std::cout << "none\n";
      continue;
    }
    for (std::size_t k = 0; k < found.size(); k++) std::cout << (k ? " " : "") << found[k];
    std::cout << "\n";
  }
  return 0;
}
