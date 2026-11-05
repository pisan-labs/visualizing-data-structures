// Knuth-Morris-Pratt. pi[j] is the length of the longest proper prefix
// of pattern[0..j] that is also a suffix of it. After a mismatch the
// pattern slides so that border lines up with the text it matched, and
// the text pointer s + q never moves back.
#pragma once

#include <string>
#include <vector>

// pi[j] for every j: the longest border of p[0..j].
inline std::vector<int> prefix_function(const std::string& p) {
  const int m = static_cast<int>(p.size());
  std::vector<int> pi(m, 0);
  int q = 0;
  for (int i = 1; i < m; i++) {
    while (q > 0 && p[q] != p[i]) q = pi[q - 1];
    if (p[q] == p[i]) q++;
    pi[i] = q;
  }
  return pi;
}

// Returns every shift s where pattern occurs in text.
inline std::vector<int> kmp_search(const std::string& text, const std::string& pattern) {
  const int n = static_cast<int>(text.size());
  const int m = static_cast<int>(pattern.size());
  const std::vector<int> pi = prefix_function(pattern);
  std::vector<int> found;
  int s = 0;
  int q = 0;  // at shift s, the first q characters are known to match
  while (s <= n - m) {
    while (q < m && text[s + q] == pattern[q]) q++;
    if (q == m) found.push_back(s);
    if (q == 0) {
      s++;
    } else {
      s += q - pi[q - 1];
      q = pi[q - 1];
    }
  }
  return found;
}
