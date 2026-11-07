#pragma once

#include <algorithm>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

// A one-tape Turing machine, as in Sipser.
//
// Rules look like "q0 1 -> q1 0 R" (in q0 reading 1: write 0, move right, go to q1), or
// "q1 0,y -> q1 R" to leave the symbol as it is, separated by semicolons. "start q0" names the
// start state; otherwise it is the first rule's state. The states accept and reject halt, and
// a missing rule rejects. The tape starts at cell 0: a move left from there leaves the head
// where it is.
class TuringMachine {
 public:
  static constexpr char BLANK = '_';

  // verdict is "accept", "reject" or "running" (stopped after max_moves).
  struct Result {
    std::string verdict;
    int moves;
    std::string tape;
  };

  explicit TuringMachine(const std::string& text) {
    std::istringstream items(text);
    for (std::string item; std::getline(items, item, ';');) {
      std::istringstream in(item);
      std::vector<std::string> w;  // state symbols -> next [write] move
      for (std::string word; in >> word;) w.push_back(word);
      if (w.empty()) continue;
      if (w[0] == "start") {
        start_ = w[1];
        continue;
      }
      std::istringstream symbols(w[1]);
      for (std::string a; std::getline(symbols, a, ',');) {
        char write = w.size() == 6 ? w[4][0] : a[0];  // the short form keeps the symbol
        delta_[{w[0], a[0]}] = Rule{w[3], write, w.back()[0]};
      }
      if (start_.empty()) start_ = w[0];
    }
  }

  Result run(const std::string& word, int max_moves = 500) const {
    std::map<int, char> tape;
    for (int i = 0; i < static_cast<int>(word.size()); i++) tape[i] = word[i];
    std::string state = start_;
    int head = 0;
    int moves = 0;
    while (state != "accept" && state != "reject") {
      auto cell = tape.find(head);
      auto rule = delta_.find({state, cell == tape.end() ? BLANK : cell->second});
      if (rule == delta_.end()) {
        state = "reject";
        break;
      }
      if (moves == max_moves) return {"running", moves, tape_text(tape)};
      const Rule& r = rule->second;
      tape[head] = r.write;
      if (r.move == 'R') head++;
      else if (r.move == 'L') head = std::max(0, head - 1);
      state = r.next;
      moves++;
    }
    return {state, moves, tape_text(tape)};
  }

 private:
  struct Rule {
    std::string next;
    char write;
    char move;
  };
  std::map<std::pair<std::string, char>, Rule> delta_;
  std::string start_;

  // The tape from its first to its last non-blank cell, or _ if it is blank.
  static std::string tape_text(const std::map<int, char>& tape) {
    auto filled = [](const std::pair<const int, char>& c) { return c.second != BLANK; };
    auto first = std::find_if(tape.begin(), tape.end(), filled);
    if (first == tape.end()) return std::string(1, BLANK);
    auto last = std::find_if(tape.rbegin(), tape.rend(), filled);
    std::string out;
    for (int i = first->first; i <= last->first; i++) {
      auto cell = tape.find(i);
      out += cell == tape.end() ? BLANK : cell->second;
    }
    return out;
  }
};
