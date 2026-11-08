// Test driver: reads "sample k x1 ... xn | j(k+1) ... jn", one per line: the reservoir size, the
// stream, then the random draws for the items after the first k. Prints the reservoir.
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "reservoir.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    int k = 0;
    if (!(words >> op >> k) || op != "sample") continue;
    std::vector<std::string> stream;
    while (words >> w && w != "|") stream.push_back(w);
    std::vector<int> draws;
    while (words >> w) draws.push_back(std::stoi(w));
    std::size_t next = 0;
    std::vector<std::string> kept = reservoir_sample(stream, k, [&](int lo, int hi) {
      int j = draws.at(next++);
      if (j < lo || j > hi) throw std::out_of_range("draw out of range");
      return j;
    });
    for (std::size_t i = 0; i < kept.size(); i++) std::cout << (i ? " " : "") << kept[i];
    std::cout << "\n";
  }
  return 0;
}
