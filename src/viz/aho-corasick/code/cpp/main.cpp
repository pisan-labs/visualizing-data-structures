// Test driver: "search P1,P2,... T" prints every match as start:word,
// separated by spaces, in the order the scan finds them, or "none".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "aho_corasick.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, list, text;
    if (!(words >> op >> list >> text) || op != "search") continue;
    std::vector<std::string> patterns;
    std::istringstream items(list);
    for (std::string p; std::getline(items, p, ',');) patterns.push_back(p);
    const auto found = AhoCorasick(patterns).search(text);
    if (found.empty()) std::cout << "none";
    for (std::size_t k = 0; k < found.size(); k++)
      std::cout << (k ? " " : "") << found[k].first << ":" << found[k].second;
    std::cout << "\n";
  }
  return 0;
}
