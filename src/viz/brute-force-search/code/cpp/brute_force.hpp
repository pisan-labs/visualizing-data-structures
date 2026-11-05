// Brute-force string search: put the pattern at every shift s and
// compare it with text[s..s+m-1] from left to right, stopping at the
// first mismatch.
#pragma once

#include <string>
#include <vector>

// Returns every shift s where pattern occurs in text.
inline std::vector<int> brute_force_search(const std::string& text, const std::string& pattern) {
  const int n = static_cast<int>(text.size());
  const int m = static_cast<int>(pattern.size());
  std::vector<int> found;
  for (int s = 0; s <= n - m; s++) {
    int j = 0;
    while (j < m && text[s + j] == pattern[j]) j++;
    if (j == m) found.push_back(s);
  }
  return found;
}
