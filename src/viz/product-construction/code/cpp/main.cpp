// Test driver: reads one operation per line, prints one result per line. Each "dfa <states>"
// line starts a machine: the first is A, the next B, then A again.
#include <iostream>
#include <sstream>
#include <string>

#include "product.hpp"

static std::string joined(const std::string& text) { return text.empty() ? "-" : text; }

int main() {
  Dfa machines[2];
  int which = 1;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op)) continue;
    Dfa& m = machines[which];
    if (op == "dfa") {
      which = 1 - which;
      machines[which] = Dfa{};
      while (words >> w) machines[which].states.push_back(w);
    } else if (op == "alphabet") {
      while (words >> w) m.alphabet.push_back(w);
    } else if (op == "start") {
      words >> m.start;
    } else if (op == "accept") {
      while (words >> w) m.accept.insert(w);
    } else if (op == "move") {
      std::string p, c, q;
      words >> p >> c >> q;
      m.delta[{p, c}] = q;
    } else if (op == "complement") {
      words >> w;
      int i = w == "A" ? 0 : 1;
      machines[i] = complement(machines[i]);
      std::string acc;
      for (const auto& q : machines[i].accept) acc += (acc.empty() ? "" : " ") + q;
      std::cout << "states " << machines[i].states.size() << " | accept " << joined(acc) << '\n';
    } else if (op == "build") {
      words >> w;
      Dfa d = product(machines[0], machines[1], w);
      std::string states, acc, moves;
      for (const auto& r : d.states) {
        states += (states.empty() ? "" : " ") + r;
        if (d.accept.count(r)) acc += (acc.empty() ? "" : " ") + r;
        for (const auto& c : d.alphabet)
          moves += (moves.empty() ? "" : " ") + r + "-" + c + "->" + d.delta.at({r, c});
      }
      std::cout << states << " | accept " << joined(acc) << " | " << joined(moves) << '\n';
    } else if (op == "run") {
      std::string word;
      words >> w >> word;
      Dfa d = product(machines[0], machines[1], w);
      std::string r = d.start;
      for (char c : word) r = d.delta.at({r, std::string(1, c)});
      std::cout << (d.accept.count(r) ? "accept " : "reject ") << r << '\n';
    }
  }
  return 0;
}
