#pragma once

#include <algorithm>
#include <map>
#include <string>
#include <utility>
#include <vector>

// A Turing machine with k tapes (Sipser 3.13), and its simulation on one tape.
//
// add_rule("copy", "0_", "copy", "00", "RR"): in state copy, with tape 1 reading 0 and tape 2
// a blank, write 0 on both tapes and move both heads right. One character per tape; a move is
// L, R or S (stay). The states accept and reject halt, and a missing rule rejects. Every tape
// starts at cell 0: a head told to move left there stays put.
class MultiTapeTM {
 public:
  static constexpr char BLANK = '_';

  // verdict is "accept", "reject" or "running" (stopped at the cap).
  struct Result {
    std::string verdict;
    int moves;
    std::vector<std::string> tapes;
  };

  // steps counts the single tape's head moves; marks[i] is the cell under head i.
  struct SimResult {
    std::string verdict;
    int moves;
    int steps;
    std::string tape;
    std::vector<int> marks;
  };

  MultiTapeTM(int k, std::string start) : k_(k), start_(std::move(start)) {}

  void add_rule(const std::string& state, const std::string& reads, const std::string& next,
                const std::string& writes, const std::string& moves) {
    delta_[{state, reads}] = Rule{next, writes, moves};
  }

  // Run on one word per tape.
  Result run(const std::vector<std::string>& words, int max_moves = 500) const {
    std::vector<std::string> tapes(k_);
    for (int i = 0; i < k_ && i < static_cast<int>(words.size()); i++) tapes[i] = words[i];
    std::vector<int> heads(k_, 0);
    std::string state = start_;
    int moves = 0;
    while (!halted(state)) {
      std::string reads;
      for (int i = 0; i < k_; i++)
        reads += heads[i] < static_cast<int>(tapes[i].size()) ? tapes[i][heads[i]] : BLANK;
      auto rule = delta_.find({state, reads});
      if (rule == delta_.end()) {
        state = "reject";
        break;
      }
      if (moves == max_moves) return {"running", moves, tapes};
      const Rule& r = rule->second;
      for (int i = 0; i < k_; i++) {  // every head at once
        if (static_cast<int>(tapes[i].size()) <= heads[i]) tapes[i].resize(heads[i] + 1, BLANK);
        tapes[i][heads[i]] = r.writes[i];
        if (r.moves[i] == 'R') heads[i]++;
        else if (r.moves[i] == 'L') heads[i] = std::max(0, heads[i] - 1);
      }
      state = r.next;
      moves++;
    }
    return {state, moves, tapes};
  }

  // Sipser's simulation on one tape: # w1 # w2 # ... #, with a mark on each head's cell.
  SimResult simulate(const std::vector<std::string>& words, int max_moves = 100) const {
    std::string tape = "#";
    std::vector<int> marks;
    for (int i = 0; i < k_; i++) {
      std::string w = i < static_cast<int>(words.size()) ? words[i] : "";
      marks.push_back(static_cast<int>(tape.size()));
      tape += (w.empty() ? std::string(1, BLANK) : w) + "#";
    }
    int last = static_cast<int>(tape.size()) - 1;
    int steps = 2 * last;  // one pass right to write it, one pass back
    std::string state = start_;
    int moves = 0;
    while (!halted(state)) {
      std::string reads;  // scan right to the last #
      for (int m : marks) reads += tape[m];
      auto rule = delta_.find({state, reads});
      last = static_cast<int>(tape.size()) - 1;
      if (rule == delta_.end()) {
        steps += last;
        state = "reject";
        break;
      }
      if (moves == max_moves) return {"running", moves, steps, tape, marks};
      steps += last;
      const Rule& r = rule->second;
      int head = last;
      for (int i = k_ - 1; i >= 0; i--) {  // scan back, updating each mark
        int m = marks[i];
        steps += head - m;
        head = m;
        tape[m] = r.writes[i];
        if (r.moves[i] == 'L' && tape[m - 1] != '#') {
          marks[i] = head = m - 1;
          steps++;
        } else if (r.moves[i] == 'R') {
          marks[i] = head = m + 1;
          steps++;
          if (tape[m + 1] == '#') {  // a new cell: shift the rest right, walk back
            steps += 2 * (static_cast<int>(tape.size()) - m - 1);
            tape.insert(tape.begin() + m + 1, BLANK);
            for (int j = i + 1; j < k_; j++) marks[j]++;
          }
        }
      }
      steps += head;  // back to the first #
      state = r.next;
      moves++;
    }
    return {state, moves, steps, tape, marks};
  }

 private:
  struct Rule {
    std::string next;
    std::string writes;
    std::string moves;
  };
  int k_;
  std::string start_;
  std::map<std::pair<std::string, std::string>, Rule> delta_;

  static bool halted(const std::string& state) { return state == "accept" || state == "reject"; }
};
