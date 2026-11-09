// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "strassen.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op) || op != "multiply") continue;
    int n;
    words >> n;
    Matrix a(n, std::vector<int>(n)), b(n, std::vector<int>(n));
    for (auto& row : a)
      for (int& x : row) words >> x;
    for (auto& row : b)
      for (int& x : row) words >> x;
    Strassen s;
    Matrix c = s.multiply(a, b);
    std::string rows;
    for (size_t i = 0; i < c.size(); i++) {
      if (i) rows += "; ";
      for (size_t j = 0; j < c[i].size(); j++) rows += (j ? " " : "") + std::to_string(c[i][j]);
    }
    std::cout << rows << " | " << s.mults << ' ' << s.adds << '\n';
  }
  return 0;
}
