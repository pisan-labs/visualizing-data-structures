// Test driver: reads one operation per line, prints one result per line.
//   build <regex>  ->  "<n> states, <m> moves", or "error"
//   run <word>     ->  "accept" or "reject" (ε or eps is the empty word), or "error"
#include <cctype>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "thompson.hpp"

int main() {
  std::unique_ptr<ThompsonNfa> nfa;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "build") {
      try {
        nfa = std::make_unique<ThompsonNfa>(arg);
        std::cout << nfa->states() << " states, " << nfa->moveCount() << " moves\n";
      } catch (const std::invalid_argument&) {
        std::cout << "error\n";
      }
    } else if (op == "run") {
      std::string word = arg == EPS || arg == "eps" ? "" : arg;
      bool ok = true;
      for (char c : word) ok = ok && std::isalnum(static_cast<unsigned char>(c));
      std::cout << (!ok ? "error" : nfa->accepts(word) ? "accept" : "reject") << "\n";
    }
  }
  return 0;
}
