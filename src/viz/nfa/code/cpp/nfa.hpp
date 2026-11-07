#pragma once
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

// A nondeterministic finite automaton with epsilon-moves (Sipser). The machine
// is in a set of states at once, and it accepts when that set holds an accept
// state after the whole word is read.
class Nfa {
 public:
  static constexpr char EPS = '\0';  // the symbol of an epsilon-move

  Nfa(std::string start, std::set<std::string> accept)
      : start_(std::move(start)), accept_(std::move(accept)) {}

  void addMove(const std::string& from, char symbol, const std::string& to) {
    delta_[{from, symbol}].insert(to);
  }

  // E(S): the states, and every state their epsilon-moves reach.
  std::set<std::string> closure(std::set<std::string> states) const {
    std::vector<std::string> todo(states.begin(), states.end());
    while (!todo.empty()) {
      std::string q = todo.back();
      todo.pop_back();
      for (const auto& r : targets(q, EPS)) {
        if (states.insert(r).second) todo.push_back(r);  // an epsilon-loop stops here
      }
    }
    return states;
  }

  // The set of states the machine is in after reading the word.
  std::set<std::string> run(const std::string& word) const {
    std::set<std::string> current = closure({start_});
    for (char c : word) {
      std::set<std::string> moved;
      for (const auto& q : current) {
        const auto& to = targets(q, c);
        moved.insert(to.begin(), to.end());
      }
      current = closure(moved);
      if (current.empty()) break;  // every branch has died
    }
    return current;
  }

  bool accepts(const std::string& word) const {
    for (const auto& q : run(word))
      if (accept_.count(q)) return true;
    return false;
  }

 private:
  const std::set<std::string>& targets(const std::string& q, char c) const {
    static const std::set<std::string> none;
    auto it = delta_.find({q, c});
    return it == delta_.end() ? none : it->second;
  }

  std::string start_;
  std::set<std::string> accept_;
  std::map<std::pair<std::string, char>, std::set<std::string>> delta_;
};
