// Test driver: "zarray S" prints z[0..n-1]; "search T P" prints the
// shifts where P occurs in T, or "none".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "z_algorithm.hpp"

static void print(const std::vector<int>& xs) {
  for (std::size_t k = 0; k < xs.size(); k++) std::cout << (k ? " " : "") << xs[k];
  std::cout << "\n";
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, a, b;
    words >> op >> a;
    if (op == "zarray") {
      print(z_array(a));
    } else if (op == "search" && words >> b) {
      const std::vector<int> found = z_search(a, b);
      if (found.empty())
        std::cout << "none\n";
      else
        print(found);
    }
  }
  return 0;
}
