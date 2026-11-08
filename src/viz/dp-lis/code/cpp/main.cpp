// Test driver: "table a1 a2 ..." (the O(n^2) method) or "tails a1 a2 ..." (binary search) prints
// the length of a longest increasing subsequence and the subsequence itself.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "lis.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> a;
    int x;
    while (words >> x) a.push_back(x);
    if (a.empty()) continue;
    const auto seq = op == "table" ? lis_table(a) : lis_tails(a);
    std::cout << seq.size();
    for (int v : seq) std::cout << ' ' << v;
    std::cout << "\n";
  }
  return 0;
}
