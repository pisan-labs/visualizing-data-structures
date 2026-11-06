// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "suffix_tree.hpp"

static std::string nested(const SuffixTree& t, const Node& u, bool top) {
  std::string inner;
  for (const auto& [c, kid] : u.kids) inner += (inner.empty() ? "" : " ") + nested(t, *kid, false);
  std::string label = top ? "" : t.label(u);
  return u.kids.empty() ? label : label + "(" + inner + ")";
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, text, p;
    if (!(words >> op >> text)) continue;
    words >> p;
    SuffixTree t(text);
    if (op == "build") {
      std::cout << nested(t, t.root, true) << '\n';
    } else if (op == "search") {
      std::vector<int> found = t.search(p);
      std::string out;
      for (int x : found) out += (out.empty() ? "" : " ") + std::to_string(x);
      std::cout << (found.empty() ? "none" : out) << '\n';
    } else if (op == "count") {
      std::cout << t.count(p) << '\n';
    } else if (op == "repeat") {
      std::string r = t.longestRepeat();
      std::cout << (r.empty() ? "none" : r) << '\n';
    }
  }
}
