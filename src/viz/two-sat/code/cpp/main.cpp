// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "two_sat.hpp"

int main() {
  std::vector<std::string> names;
  std::map<std::string, int> index;
  std::vector<std::pair<int, int>> clauses;
  auto literal = [&](const std::string& token) {
    const bool neg = token[0] == '!';
    return 2 * index[neg ? token.substr(1) : token] + (neg ? 1 : 0);
  };
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "vars") {
      names.clear();
      index.clear();
      clauses.clear();
      for (std::string name; words >> name;) {
        index[name] = static_cast<int>(names.size());
        names.push_back(name);
      }
    } else if (op == "clause") {
      std::string a, b;
      words >> a >> b;
      clauses.emplace_back(literal(a), literal(b));
    } else if (op == "solve") {
      const auto value = two_sat(static_cast<int>(names.size()), clauses);
      if (!value) {
        std::cout << "UNSAT\n";
        continue;
      }
      for (size_t i = 0; i < names.size(); i++)
        std::cout << (i ? " " : "") << names[i] << "=" << ((*value)[i] ? "T" : "F");
      std::cout << "\n";
    }
  }
  return 0;
}
