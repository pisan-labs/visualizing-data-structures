// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

#include "machines.hpp"

using Machine = std::variant<Moore, Mealy>;

Machine convert(const Machine& m) {
  if (const auto* moore = std::get_if<Moore>(&m)) return toMealy(*moore);
  return toMoore(std::get<Mealy>(m));
}

std::string run(const Machine& m, const std::string& word) {
  std::string w = std::visit([&](const auto& x) { return x.run(word); }, m);
  return w.empty() ? "-" : w;
}

std::string show(const Machine& m) {
  std::string s;
  if (const auto* moore = std::get_if<Moore>(&m)) {
    s = "moore start=" + moore->start + " |";
    for (const auto& [q, o] : moore->out) s += " " + q + "/" + o;
    s += " |";
    for (const auto& [move, q] : moore->delta)
      s += " " + move.first + "-" + move.second + "->" + q;
    return s;
  }
  const auto& mealy = std::get<Mealy>(m);
  s = "mealy start=" + mealy.start + " |";
  for (const auto& [move, q] : mealy.delta)
    s += " " + move.first + "-" + move.second + "/" + mealy.out.at(move) + "->" + q;
  return s;
}

int main() {
  std::string kind, start;
  std::vector<std::string> states;
  Delta delta;
  std::map<std::string, char> stateOut;
  std::map<Move, char> moveOut;
  std::optional<Machine> machine, result;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "mealy" || op == "moore") {
      kind = op;
      states.clear();
      for (std::string q; words >> q;) states.push_back(q);
      delta.clear();
      stateOut.clear();
      moveOut.clear();
      machine.reset();
      result.reset();
    } else if (op == "start") {
      words >> start;
    } else if (op == "out") {
      std::string q, o;
      words >> q >> o;
      stateOut[q] = o[0];
    } else if (op == "move") {
      std::string from, symbol, to, o;
      words >> from >> symbol >> to;
      delta[{from, symbol[0]}] = to;
      if (words >> o) moveOut[{from, symbol[0]}] = o[0];
    } else if (op == "run" || op == "convert" || op == "back") {
      if (!machine) {
        if (kind == "moore")
          machine = Moore{states, start, delta, stateOut};
        else
          machine = Mealy{states, start, delta, moveOut};
      }
      if (op == "run") {
        std::string word;
        words >> word;  // stays empty for the empty word
        std::cout << run(*machine, word);
        if (result) std::cout << " | " << run(*result, word);
        std::cout << '\n';
      } else {
        if (op == "back") machine = result;
        result = convert(*machine);
        std::cout << show(*result) << '\n';
      }
    }
  }
  return 0;
}
