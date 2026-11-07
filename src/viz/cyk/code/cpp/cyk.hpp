// CYK: decides whether a grammar in Chomsky normal form generates a word. A rule's body is one
// terminal, two variables, or nothing (for start -> eps).
#pragma once
#include <set>
#include <string>
#include <vector>

struct Rule {
  std::string head;
  std::vector<std::string> body;
};

using Cell = std::set<std::string>;

// table[length][i]: the variables that derive the substring of that length starting at i.
inline std::vector<std::vector<Cell>> cyk_table(const std::vector<Rule>& rules,
                                                const std::vector<std::string>& word) {
  size_t n = word.size();
  std::vector<std::vector<Cell>> table(n + 1);
  for (size_t length = 0; length <= n; length++) table[length].resize(n - length + 1);
  for (size_t i = 0; i < n; i++)
    for (const Rule& r : rules)
      if (r.body.size() == 1 && r.body[0] == word[i]) table[1][i].insert(r.head);
  for (size_t length = 2; length <= n; length++) {
    for (size_t i = 0; i + length <= n; i++) {
      for (size_t k = 1; k < length; k++) {  // the left part has k symbols
        const Cell& left = table[k][i];
        const Cell& right = table[length - k][i + k];
        for (const Rule& r : rules)
          if (r.body.size() == 2 && left.count(r.body[0]) && right.count(r.body[1]))
            table[length][i].insert(r.head);
      }
    }
  }
  return table;
}

inline bool cyk_accepts(const std::vector<Rule>& rules, const std::string& start,
                        const std::vector<std::string>& word) {
  if (word.empty()) {
    for (const Rule& r : rules)
      if (r.head == start && r.body.empty()) return true;
    return false;
  }
  return cyk_table(rules, word)[word.size()][0].count(start) > 0;
}
