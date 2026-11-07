// Two ways to match a word on the NFA that Thompson's construction builds from a regular
// expression: backtracking (Perl, Python's re, Java, JavaScript) and NFA simulation (RE2, grep,
// Go). Both count steps: one step is one visit to a state at a position in the word.
#pragma once

#include <set>
#include <string>
#include <vector>

const char EPS = '\0';   // the symbol of an ε-move
const int CAP = 100000;  // the backtracker gives up after this many steps

struct Result {
  std::string answer;
  int steps;
};

class Nfa {
 public:
  Nfa(int states, int start, int accept) : moves_(states), start_(start), accept_(accept) {}

  // A state's moves are tried in the order they are added.
  void add(int p, char symbol, int q) { moves_[p].push_back({symbol, q}); }

  // One path at a time, depth first.
  Result backtrack(const std::string& word) const {
    const int n = static_cast<int>(word.size());
    int steps = 0;
    std::vector<Choice> stack{{start_, 0, {}}};
    while (!stack.empty()) {
      Choice c = stack.back();
      stack.pop_back();
      while (true) {
        steps++;
        if (c.q == accept_ && c.i == n) return {"accept", steps};
        if (steps == CAP) return {"stopped", steps};
        c.seen.insert(c.q);
        std::vector<Choice> ways;
        for (const Move& m : moves_[c.q]) {
          if (m.symbol == EPS) {
            // An ε-loop back to a state passed here goes nowhere.
            if (!c.seen.count(m.to)) ways.push_back({m.to, c.i, c.seen});
          } else if (c.i < n && word[c.i] == m.symbol) {
            ways.push_back({m.to, c.i + 1, {}});
          }
        }
        if (ways.empty()) break;  // dead end: back up to the latest choice
        for (size_t k = ways.size() - 1; k > 0; k--) stack.push_back(ways[k]);  // for later
        c = ways[0];
      }
    }
    return {"reject", steps};
  }

  // Every path at once: the set of states the NFA could be in.
  Result simulate(const std::string& word) const {
    std::set<int> current = closure({start_});
    int steps = static_cast<int>(current.size());
    for (char ch : word) {
      if (current.empty()) break;
      std::set<int> next;
      for (int q : current)
        for (const Move& m : moves_[q])
          if (m.symbol == ch) next.insert(m.to);
      current = closure(next);
      steps += static_cast<int>(current.size());
    }
    return {current.count(accept_) ? "accept" : "reject", steps};
  }

 private:
  struct Move {
    char symbol;
    int to;
  };
  // A choice left for later: a state, the symbols read, and the states passed there.
  struct Choice {
    int q, i;
    std::set<int> seen;
  };

  std::vector<std::vector<Move>> moves_;
  int start_, accept_;

  // Every state reachable from `states` by ε-moves alone.
  std::set<int> closure(std::set<int> states) const {
    std::vector<int> todo(states.begin(), states.end());
    while (!todo.empty()) {
      int p = todo.back();
      todo.pop_back();
      for (const Move& m : moves_[p])
        if (m.symbol == EPS && states.insert(m.to).second) todo.push_back(m.to);
    }
    return states;
  }
};
