// Toy programs that read their input and never write, and the machine D built from them.
//
// A program is a string of instructions, numbered lines from 1:
//   A accept, R reject, > move right, < move left (the head stays on the end cell, or on
//   cell 0), Gk goto k, Ek goto k if the head is past the input, ?ck goto k if the head is on
//   the symbol c. Running past the last line rejects. A program's description is its code.
#pragma once

#include <algorithm>
#include <map>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

const int CAP = 1000;

struct Line {
  char op;   // A R < > G E ?
  char sym;  // the symbol ? tests
  int to;    // the line G, E and ? jump to
};

// How a run ended: accept or reject after `a` steps, loop (a = first, b = again), unknown.
struct Result {
  std::string outcome;
  int a = 0;
  int b = 0;

  std::string str() const {
    if (outcome == "loop") return "loop " + std::to_string(a) + " " + std::to_string(b);
    if (outcome == "unknown") return outcome;
    return outcome + " " + std::to_string(a);
  }
};

inline std::vector<Line> parse(const std::string& code) {
  std::vector<Line> prog;
  size_t k = 0;
  while (k < code.size()) {
    char op = code[k];
    if (op == 'A' || op == 'R' || op == '<' || op == '>') {
      prog.push_back({op, ' ', 0});
      k += 1;
    } else if (op == 'G' || op == 'E') {
      prog.push_back({op, ' ', code.at(k + 1) - '0'});
      k += 2;
    } else if (op == '?') {
      prog.push_back({op, code.at(k + 1), code.at(k + 2) - '0'});
      k += 3;
    } else {
      throw std::invalid_argument(std::string(1, op) + " is not an instruction");
    }
  }
  return prog;
}

// Run a program on a word, one line per step. The program never writes, so (line, head) is
// its whole configuration: a repeat means it does the same thing again, forever.
inline Result run(const std::string& code, const std::string& word) {
  std::vector<Line> prog = parse(code);
  int m = static_cast<int>(word.size());
  int line = 1;
  int head = 0;
  std::map<std::pair<int, int>, int> seen;
  for (int step = 1; step <= CAP; step++) {
    if (line > static_cast<int>(prog.size())) return {"reject", step - 1};
    auto found = seen.find({line, head});
    if (found != seen.end()) return {"loop", found->second, step};
    seen[{line, head}] = step;
    const Line& ins = prog[line - 1];
    if (ins.op == 'A') return {"accept", step};
    if (ins.op == 'R') return {"reject", step};
    if (ins.op == '>') head = std::min(m, head + 1);
    if (ins.op == '<') head = std::max(0, head - 1);
    bool jump = ins.op == 'G' || (ins.op == 'E' && head == m) ||
                (ins.op == '?' && head < m && word[head] == ins.sym);
    line = jump ? ins.to : line + 1;
  }
  return {"unknown", CAP};
}

inline bool halts(const std::string& code, const std::string& word) {
  std::string o = run(code, word).outcome;
  return o == "accept" || o == "reject";
}

inline bool accepts(const std::string& code, const std::string& word) {
  return run(code, word).outcome == "accept";
}

// D's entry on each program's own code: the opposite of what the program does.
inline std::vector<std::string> dRow(const std::vector<std::string>& codes,
                                     const std::string& problem) {
  std::vector<std::string> row;
  for (const std::string& c : codes) {
    if (problem == "atm")
      row.push_back(accepts(c, c) ? "rej" : "acc");
    else
      row.push_back(halts(c, c) ? "loop" : "halt");
  }
  return row;
}

// M': the same program with every reject line turned into accept.
inline std::string acceptOnHalt(const std::string& code) {
  std::string out;
  for (const Line& ins : parse(code)) {
    out += ins.op == 'R' ? 'A' : ins.op;
    if (ins.op == '?') out += ins.sym;
    if (ins.to > 0) out += std::to_string(ins.to);
  }
  return out;
}

// S from a halting decider: a loop is rejected unrun; anything else is run.
inline std::string sDecidesAtm(const std::string& code, const std::string& word) {
  if (!halts(code, word)) return "reject";
  return run(code, word).outcome;
}

// R from an acceptance decider: M halts on w exactly when M' accepts w.
inline std::string rDecidesHalt(const std::string& code, const std::string& word) {
  return accepts(acceptOnHalt(code), word) ? "halts" : "loops";
}
