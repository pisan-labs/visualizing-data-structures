#pragma once
#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>

// A deterministic finite automaton (Sipser): a start state q0, accept states F
// and a transition function delta. A move may be missing; the word is then
// rejected.
class Dfa {
 public:
  Dfa(std::string start, std::set<std::string> accept)
      : start_(std::move(start)), accept_(std::move(accept)) {}

  void addMove(const std::string& from, char symbol, const std::string& to) {
    delta_[{from, symbol}] = to;
  }

  // The state the machine ends in, or nothing if a move is missing.
  std::optional<std::string> run(const std::string& word) const {
    std::string q = start_;
    for (char c : word) {
      auto it = delta_.find({q, c});
      if (it == delta_.end()) return std::nullopt;  // no move: reject
      q = it->second;
    }
    return q;
  }

  bool accepts(const std::string& word) const {
    auto q = run(word);
    return q && accept_.count(*q) > 0;
  }

 private:
  std::string start_;
  std::set<std::string> accept_;
  std::map<std::pair<std::string, char>, std::string> delta_;
};
