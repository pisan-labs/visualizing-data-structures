// Test driver: "revenue p1 p2 ... pn" prints the best revenue for a rod of length n;
// "cut p1 ... pn" prints the best revenue and the pieces, first piece first.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "rod.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> p{0};
    int price;
    while (words >> price) p.push_back(price);
    const int n = static_cast<int>(p.size()) - 1;
    if (n == 0) continue;
    const auto [r, s] = cut_rod_table(p);
    if (op == "revenue") std::cout << r[n] << "\n";
    if (op == "cut") {
      std::cout << r[n];
      for (int piece : cut_rod_pieces(s, n)) std::cout << ' ' << piece;
      std::cout << "\n";
    }
  }
  return 0;
}
