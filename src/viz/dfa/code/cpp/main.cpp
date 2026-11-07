// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <tuple>
#include <vector>

#include "dfa.hpp"

int main() {
  std::string start;
  std::set<std::string> accept;
  std::vector<std::tuple<std::string, char, std::string>> moves;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "machine") {
      words >> start;
      accept.clear();
      moves.clear();
    } else if (op == "accept") {
      std::string q;
      while (words >> q) accept.insert(q);
    } else if (op == "move") {
      std::string from, symbol, to;
      words >> from >> symbol >> to;
      moves.emplace_back(from, symbol[0], to);
    } else if (op == "run") {
      std::string word;
      words >> word;  // stays empty for the empty word
      Dfa m(start, accept);
      for (const auto& [from, c, to] : moves) m.addMove(from, c, to);
      auto q = m.run(word);
      std::cout << (m.accepts(word) ? "accept " : "reject ") << (q ? *q : "none") << '\n';
    }
  }
  return 0;
}
