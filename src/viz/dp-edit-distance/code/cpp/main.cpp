// Test driver: "dist a b ins del sub" prints the edit distance; "align a b ins del sub" prints
// the distance and the edits (M match, S substitute, D delete, I insert) from left to right.
#include <iostream>
#include <sstream>
#include <string>

#include "edit_distance.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, a, b;
    int ins = 0, del = 0, sub = 0;
    if (!(words >> op >> a >> b >> ins >> del >> sub)) continue;
    const int dist = edit_distance(a, b, ins, del, sub);
    if (op == "dist") std::cout << dist << "\n";
    if (op == "align") std::cout << dist << ' ' << alignment(a, b, ins, del, sub) << "\n";
  }
  return 0;
}
