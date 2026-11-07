// Test driver: reads one operation per line, prints one line per match.
//   nfa <states> <start> <accept>     a new NFA with no moves yet (prints nothing)
//   move <from> <symbol or eps> <to>  a move; a state's moves are tried in the order given
//   match <word, or eps>              "<backtracking answer> <steps> <simulation answer> <steps>"
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "regex_engines.hpp"

int main() {
  std::unique_ptr<Nfa> nfa;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "nfa") {
      int states, start, accept;
      in >> states >> start >> accept;
      nfa = std::make_unique<Nfa>(states, start, accept);
    } else if (op == "move") {
      int p, q;
      std::string symbol;
      in >> p >> symbol >> q;
      nfa->add(p, symbol == "eps" ? EPS : symbol[0], q);
    } else if (op == "match") {
      std::string word;
      in >> word;
      if (word == "eps") word = "";
      Result b = nfa->backtrack(word);
      Result s = nfa->simulate(word);
      std::cout << b.answer << ' ' << b.steps << ' ' << s.answer << ' ' << s.steps << '\n';
    }
  }
  return 0;
}
