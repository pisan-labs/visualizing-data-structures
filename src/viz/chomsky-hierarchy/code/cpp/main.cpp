// Test driver: reads one operation per line, prints one result per line.
//   classify S -> aSb | eps   prints "context-free (not regular: S -> aSb)"
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "chomsky.hpp"

static std::string squash(const std::string& s) {
  std::string out;
  for (char c : s)
    if (c != ' ' && c != '\t' && c != '\r') out += c;
  return out;
}

static std::string show(const Rule& r) {
  return r.first + " -> " + (r.second.empty() ? "eps" : r.second);
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    size_t space = line.find(' ');
    if (line.substr(0, space) != "classify") continue;
    std::vector<Rule> rules;
    std::stringstream items(line.substr(space + 1));
    std::string item;
    while (std::getline(items, item, ';')) {
      size_t arrow = item.find("->");
      std::string left = squash(item.substr(0, arrow));
      std::stringstream alts(item.substr(arrow + 2));
      std::string alt;
      while (std::getline(alts, alt, '|')) {
        std::string right = squash(alt);
        rules.push_back({left, right == "eps" ? "" : right});
      }
    }
    char start = 0;
    for (char c : rules[0].first)
      if (!start && is_variable(c)) start = c;
    Level result = classify(rules, start);
    std::cout << result.level;
    if (result.below) {
      size_t k = 0;
      while (LEVELS[k] != result.level) k++;
      std::cout << " (not " << LEVELS[k - 1] << ": " << show(*result.below) << ")";
    }
    std::cout << "\n";
  }
  return 0;
}
