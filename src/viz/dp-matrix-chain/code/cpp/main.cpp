// Test driver: "cost p0 p1 ... pn" prints the fewest scalar multiplications for the chain;
// "order p0 p1 ... pn" prints that and the best order as nested brackets.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "matrix_chain.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> p;
    int d;
    while (words >> d) p.push_back(d);
    if (p.size() < 2) continue;
    const int n = static_cast<int>(p.size()) - 1;
    Table m, s;
    matrix_chain_order(p, m, s);
    if (op == "cost") std::cout << m[0][n - 1] << "\n";
    if (op == "order") std::cout << m[0][n - 1] << ' ' << parens(s, 0, n - 1) << "\n";
  }
  return 0;
}
