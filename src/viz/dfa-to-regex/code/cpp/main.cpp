// Test driver: reads one operation per line, prints one result per line. "dfa <states>" starts
// a DFA (states in name order, the order they are ripped in), then "alphabet", "start",
// "accept" and "move p c q" lines. "convert" prints the expression.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "state_elimination.hpp"

int main() {
  std::vector<std::string> states, accept;
  std::vector<Move> moves;
  std::string start, line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op)) continue;
    if (op == "dfa") {
      states.clear();
      accept.clear();
      moves.clear();
      while (words >> w) states.push_back(w);
    } else if (op == "start") {
      words >> start;
    } else if (op == "accept") {
      while (words >> w) accept.push_back(w);
    } else if (op == "move") {
      Move m;
      words >> m.from >> m.on >> m.to;
      moves.push_back(m);
    } else if (op == "convert") {
      std::cout << toRegex(states, start, accept, moves) << '\n';
    }
  }
  return 0;
}
