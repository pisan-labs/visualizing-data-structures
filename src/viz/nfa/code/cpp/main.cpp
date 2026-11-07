// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <tuple>
#include <vector>

#include "nfa.hpp"

int main() {
  std::string start;
  std::vector<std::string> order;
  std::set<std::string> accept;
  std::vector<std::tuple<std::string, char, std::string>> moves;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "nfa") {
      start.clear();
      order.clear();
      for (std::string q; words >> q;) order.push_back(q);
      accept.clear();
      moves.clear();
    } else if (op == "start") {
      words >> start;
    } else if (op == "accept") {
      for (std::string q; words >> q;) accept.insert(q);
    } else if (op == "move") {
      std::string from, symbol, to;
      words >> from >> symbol >> to;
      moves.emplace_back(from, symbol == "eps" ? Nfa::EPS : symbol[0], to);
    } else if (op == "run") {
      std::string word;
      words >> word;  // stays empty for the empty word
      Nfa m(start, accept);
      for (const auto& [from, c, to] : moves) m.addMove(from, c, to);
      std::set<std::string> last = m.run(word);
      std::string set;
      for (const auto& q : order)
        if (last.count(q)) set += (set.empty() ? "" : ",") + q;
      std::cout << (m.accepts(word) ? "accept {" : "reject {") << set << "}\n";
    }
  }
  return 0;
}
