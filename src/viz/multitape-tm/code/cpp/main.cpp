// Test driver: reads one operation per line, prints one result per line.
//   machine <k> <start>                           starts a machine (prints nothing)
//   rule <state> <reads> <next> <writes> <moves>  adds a rule (prints nothing)
//   run <words>        prints "accept after 16 moves: 0110=0110 | $0110"
//   simulate <words>   prints "accept after 10 moves of M and 248 on one tape: #01=01[_]#..."
#include <algorithm>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "multitape_tm.hpp"

static std::string verdict(const std::string& v) { return v == "running" ? "still running" : v; }

static std::string plural(int n) { return std::to_string(n) + (n == 1 ? " move" : " moves"); }

// "101,011" -> {"101", "011"}; ",01" -> {"", "01"}.
static std::vector<std::string> split_words(const std::string& arg) {
  std::vector<std::string> words;
  if (arg.empty()) return words;
  std::istringstream in(arg);
  for (std::string w; std::getline(in, w, ',');) words.push_back(w);
  return words;
}

int main() {
  std::unique_ptr<MultiTapeTM> machine;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string op, arg;
    in >> op;
    if (op == "machine") {
      int k;
      std::string start;
      in >> k >> start;
      machine = std::make_unique<MultiTapeTM>(k, start);
    } else if (op == "rule") {
      std::string state, reads, next, writes, moves;
      in >> state >> reads >> next >> writes >> moves;
      machine->add_rule(state, reads, next, writes, moves);
    } else if (op == "run") {
      in >> arg;
      MultiTapeTM::Result r = machine->run(split_words(arg));
      std::cout << verdict(r.verdict) << " after " << plural(r.moves) << ":";
      for (size_t i = 0; i < r.tapes.size(); i++) {
        std::string t = r.tapes[i];
        t.erase(t.find_last_not_of(MultiTapeTM::BLANK) + 1);
        std::cout << (i ? " | " : " ") << (t.empty() ? "_" : t);
      }
      std::cout << "\n";
    } else if (op == "simulate") {
      in >> arg;
      MultiTapeTM::SimResult r = machine->simulate(split_words(arg));
      std::string tape;
      for (int i = 0; i < static_cast<int>(r.tape.size()); i++) {
        bool marked = std::find(r.marks.begin(), r.marks.end(), i) != r.marks.end();
        tape += marked ? "[" + std::string(1, r.tape[i]) + "]" : std::string(1, r.tape[i]);
      }
      std::cout << verdict(r.verdict) << " after " << plural(r.moves) << " of M and " << r.steps
                << " on one tape: " << tape << "\n";
    }
  }
  return 0;
}
