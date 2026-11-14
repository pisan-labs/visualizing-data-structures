// Test driver: reads one operation per line, prints one line per result.
// "random i" makes the random pick return index i, so the output can be checked.
#include <cstddef>
#include <iostream>
#include <sstream>
#include <string>

#include "randomized_set.hpp"

int main() {
  std::size_t next_pick = 0;
  RandomizedSet set([&next_pick](std::size_t) { return next_pick; });
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "insert" || op == "remove") {
      int x;
      words >> x;
      bool ok = op == "insert" ? set.insert(x) : set.remove(x);
      std::cout << (ok ? "true" : "false") << "\n";
    } else if (op == "random") {
      if (set.size() == 0) {
        std::cout << "empty\n";
      } else {
        words >> next_pick;
        std::cout << set.get_random() << "\n";
      }
    }
  }
  return 0;
}
