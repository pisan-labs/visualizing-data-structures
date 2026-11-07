#pragma once
#include <algorithm>
#include <cstddef>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

// delta.at({q, c}) is where state q goes on symbol c; every state has a move
// on every symbol.
using Move = std::pair<std::string, char>;
using Delta = std::map<Move, std::string>;

// A Moore machine writes on its states: out.at(q).
struct Moore {
  std::vector<std::string> states;
  std::string start;
  Delta delta;
  std::map<std::string, char> out;

  std::string run(const std::string& word) const {
    std::string q = start;
    std::string written(1, out.at(q));  // before reading anything
    for (char c : word) {
      q = delta.at({q, c});
      written += out.at(q);
    }
    return written;
  }
};

// A Mealy machine writes on its moves: out.at({q, c}).
struct Mealy {
  std::vector<std::string> states;
  std::string start;
  Delta delta;
  std::map<Move, char> out;

  std::string run(const std::string& word) const {
    std::string q = start;
    std::string written;
    for (char c : word) {
      written += out.at({q, c});
      q = delta.at({q, c});
    }
    return written;
  }
};

// Each move writes what the state it enters writes. The states stay.
inline Mealy toMealy(const Moore& m) {
  Mealy r{m.states, m.start, m.delta, {}};
  for (const auto& [move, q] : m.delta) r.out[move] = m.out.at(q);
  return r;
}

// Split each state by the outputs written on the moves into it.
inline Moore toMoore(const Mealy& m) {
  std::map<std::string, std::set<char>> entered;
  char first = m.out.begin()->second;
  for (const auto& [move, q] : m.delta) {
    entered[q].insert(m.out.at(move));
    first = std::min(first, m.out.at(move));
  }
  std::map<std::pair<std::string, char>, std::string> copy;  // q's copy writing o
  Moore r{{}, m.start, {}, {}};  // q0 is its own first copy
  for (const auto& q : m.states) {
    std::set<char> outs = entered[q];
    if (outs.empty()) outs.insert(first);
    std::size_t i = 0;
    for (char o : outs) {
      std::string p = q + std::string(i++, '\'');
      copy[{q, o}] = p;
      r.states.push_back(p);
      r.out[p] = o;
    }
  }
  for (const auto& [qo, p] : copy)
    for (const auto& [move, target] : m.delta)
      if (move.first == qo.first)
        r.delta[{p, move.second}] = copy.at({target, m.out.at(move)});
  return r;
}
