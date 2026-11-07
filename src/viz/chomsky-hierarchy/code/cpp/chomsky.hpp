// The Chomsky level of a grammar, from the form of its rules. A rule is a pair of strings, left
// and right: capitals are variables, every other character is a terminal, and "" is the empty
// string. The levels are tried from the most restrictive out, and the first one whose form every
// rule fits is the answer.
#pragma once
#include <optional>
#include <string>
#include <utility>
#include <vector>

using Rule = std::pair<std::string, std::string>;

const std::vector<std::string> LEVELS = {"regular", "context-free", "context-sensitive",
                                         "unrestricted"};

struct Level {
  std::string level;
  std::optional<Rule> below;  // the first rule that does not fit the level below
};

inline bool is_variable(char c) { return c >= 'A' && c <= 'Z'; }

inline bool fits(const std::string& level, const Rule& r, char start, bool start_on_right) {
  const auto& [left, right] = r;
  bool one_variable = left.size() == 1 && is_variable(left[0]);
  if (level == "regular") {
    // A -> wB or A -> w: terminals, then at most one variable, at the end.
    int variables = 0;
    for (char c : right) variables += is_variable(c);
    return one_variable && (variables == 0 || (variables == 1 && is_variable(right.back())));
  }
  if (level == "context-free") return one_variable;
  if (level == "context-sensitive") {
    // Never shrinks, except S -> eps for a start variable on no right side.
    if (right.size() >= left.size()) return true;
    return right.empty() && left == std::string(1, start) && !start_on_right;
  }
  return true;  // unrestricted: any rule with a variable on the left
}

inline Level classify(const std::vector<Rule>& rules, char start) {
  bool start_on_right = false;
  for (const auto& r : rules)
    if (r.second.find(start) != std::string::npos) start_on_right = true;
  std::optional<Rule> below;
  for (const auto& level : LEVELS) {
    std::optional<Rule> misfit;
    for (const auto& r : rules) {
      if (!fits(level, r, start, start_on_right)) {
        misfit = r;
        break;
      }
    }
    if (!misfit) return {level, below};
    below = misfit;
  }
  return {"unrestricted", below};  // not reached: every rule fits the unrestricted form
}
