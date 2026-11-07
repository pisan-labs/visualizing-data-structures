// Finds a leftmost derivation by breadth-first search over sentential forms. A grammar maps
// each variable to its right sides, in order. Capitals are variables, every other character is
// a terminal, and "" is the empty word.
#pragma once
#include <algorithm>
#include <cctype>
#include <deque>
#include <map>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

using Rules = std::map<char, std::vector<std::string>>;

struct Derivation {
  bool gave_up = false;
  std::vector<std::string> forms;  // empty: no derivation
};

const int CAP = 10000;
const int NONE = 1000000;  // "derives no word": longer than any form the search allows

inline bool is_variable(char c) { return std::isupper(static_cast<unsigned char>(c)) != 0; }

inline int first_variable(const std::string& form) {
  for (size_t i = 0; i < form.size(); i++)
    if (is_variable(form[i])) return static_cast<int>(i);
  return -1;
}

// The length of the shortest word each variable derives (NONE: no word at all).
inline std::map<char, int> shortest_words(const Rules& rules, const std::set<char>& variables) {
  std::map<char, int> best;
  for (char v : variables) best[v] = NONE;
  for (bool changed = true; changed;) {
    changed = false;
    for (const auto& [head, bodies] : rules) {
      for (const auto& body : bodies) {
        int n = 0;
        for (char c : body) n += is_variable(c) ? best[c] : 1;
        if (n < best[head]) {
          best[head] = n;
          changed = true;
        }
      }
    }
  }
  return best;
}

inline Derivation leftmost_derivation(const Rules& rules, char start, const std::string& word) {
  std::set<char> variables;
  size_t widest = 1;
  for (const auto& [head, bodies] : rules) {
    variables.insert(head);
    for (const auto& b : bodies) {
      widest = std::max(widest, b.size());
      for (char c : b)
        if (is_variable(c)) variables.insert(c);
    }
  }
  std::map<char, int> shortest = shortest_words(rules, variables);
  size_t n = word.size();
  // No leftmost form in a smallest parse tree's derivation is longer than this.
  size_t longest = n + 1 + (widest - 1) * variables.size() * (n + 1);

  auto fits = [&](const std::string& form) {
    if (form.size() > longest) return false;
    size_t len = 0;
    for (char c : form) len += is_variable(c) ? shortest[c] : 1;
    if (len > n) return false;
    int i = first_variable(form);
    if (i < 0) return form == word;
    return word.compare(0, i, form, 0, i) == 0 && static_cast<size_t>(i) <= n;
  };

  std::unordered_map<std::string, std::string> parent;
  std::deque<std::string> queue;
  std::string first(1, start);
  parent[first] = "";
  queue.push_back(first);
  int tried = 0;
  while (!queue.empty()) {
    if (tried == CAP) return {true, {}};
    std::string form = queue.front();
    queue.pop_front();
    tried++;
    int i = first_variable(form);
    auto it = rules.find(form[i]);
    if (it == rules.end()) continue;
    for (const auto& body : it->second) {
      std::string child = form.substr(0, i) + body + form.substr(i + 1);
      if (parent.count(child) || !fits(child)) continue;
      parent[child] = form;
      if (first_variable(child) < 0) {
        std::vector<std::string> forms{child};
        while (forms.back() != first) forms.push_back(parent[forms.back()]);
        std::reverse(forms.begin(), forms.end());
        return {false, forms};
      }
      queue.push_back(child);
    }
  }
  return {false, {}};
}
