// Test driver: reads "shuffle x1 ... xn | j1 j2 ...", one per line: the values, then the random
// picks to use in order. Prints the shuffled values.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "shuffle.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op) || op != "shuffle") continue;
    std::vector<std::string> values;
    while (words >> w && w != "|") values.push_back(w);
    std::vector<int> picks;
    while (words >> w) picks.push_back(std::stoi(w));
    std::size_t next = 0;
    shuffle(values, [&](int lo, int hi) {
      int j = picks.at(next++);
      if (j < lo || j > hi) throw std::out_of_range("pick out of range");
      return j;
    });
    for (std::size_t k = 0; k < values.size(); k++) std::cout << (k ? " " : "") << values[k];
    std::cout << "\n";
  }
  return 0;
}
