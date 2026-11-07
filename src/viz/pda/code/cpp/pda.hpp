#pragma once
#include <deque>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

// A pushdown automaton (Sipser), run by a breadth-first search over
// configurations. A move reads a symbol or nothing, pops a symbol or nothing,
// and pushes a string whose first symbol ends up on top. Stacks are strings,
// top first.
class Pda {
 public:
  static constexpr char EPS = '\0';  // read nothing or pop nothing
  static constexpr int CAP = 200;    // give up after this many configurations
  static constexpr int REJECT = -1;  // every branch died
  static constexpr int STOPPED = -2;  // the search reached CAP first

  struct Move {
    std::string from;
    char read;
    char pop;
    std::string to;
    std::string push;
  };

  Pda(std::string start, std::set<std::string> accept, std::vector<Move> moves,
      std::string stack, bool byEmptyStack)
      : start_(std::move(start)), accept_(std::move(accept)),
        moves_(std::move(moves)), stack_(std::move(stack)),
        byEmptyStack_(byEmptyStack) {}

  // The moves of a shortest accepting computation, or REJECT, or STOPPED.
  int run(const std::string& word) const {
    Config first{start_, 0, stack_};
    if (accepting(first, word)) return 0;
    std::map<Config, int> depth{{first, 0}};  // every configuration seen
    std::deque<Config> queue{first};
    while (!queue.empty()) {
      Config c = queue.front();
      queue.pop_front();
      for (const Move& m : moves_) {
        if (!fits(m, c, word)) continue;
        Config next = apply(m, c);
        if (depth.count(next)) continue;  // seen before: a loop of moves ends
        if (static_cast<int>(depth.size()) == CAP) return STOPPED;
        depth[next] = depth[c] + 1;
        if (accepting(next, word)) return depth[next];
        queue.push_back(next);
      }
    }
    return REJECT;
  }

 private:
  // (state, symbols read, stack top first)
  using Config = std::tuple<std::string, std::size_t, std::string>;

  bool accepting(const Config& c, const std::string& word) const {
    const auto& [state, read, stack] = c;
    if (read < word.size()) return false;
    return byEmptyStack_ ? stack.empty() : accept_.count(state) > 0;
  }

  static bool fits(const Move& m, const Config& c, const std::string& word) {
    const auto& [state, read, stack] = c;
    if (m.from != state) return false;
    if (m.read != EPS && (read == word.size() || word[read] != m.read))
      return false;
    return m.pop == EPS || (!stack.empty() && stack[0] == m.pop);
  }

  static Config apply(const Move& m, const Config& c) {
    const auto& [state, read, stack] = c;
    std::string rest = m.pop == EPS ? stack : stack.substr(1);
    return {m.to, read + (m.read == EPS ? 0 : 1), m.push + rest};
  }

  std::string start_;
  std::set<std::string> accept_;
  std::vector<Move> moves_;
  std::string stack_;  // what the stack holds at the start
  bool byEmptyStack_;
};
