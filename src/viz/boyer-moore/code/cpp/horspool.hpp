// Boyer-Moore-Horspool: compare from the right end of the pattern, and
// after each alignment slide by the table entry for the text character
// under the pattern's last position.
#pragma once

#include <array>
#include <string>
#include <vector>

// shift[c]: how far to slide when c is under the pattern's last position.
inline std::array<int, 256> shift_table(const std::string& pattern) {
  const int m = static_cast<int>(pattern.size());
  std::array<int, 256> shift;
  shift.fill(m);
  // Later characters overwrite earlier ones.
  for (int j = 0; j < m - 1; j++) shift[static_cast<unsigned char>(pattern[j])] = m - 1 - j;
  return shift;
}

// Returns every shift s where pattern occurs in text.
inline std::vector<int> horspool_search(const std::string& text, const std::string& pattern) {
  const int n = static_cast<int>(text.size());
  const int m = static_cast<int>(pattern.size());
  const std::array<int, 256> shift = shift_table(pattern);
  std::vector<int> found;
  int s = 0;
  while (s <= n - m) {
    int j = m - 1;
    while (j >= 0 && text[s + j] == pattern[j]) j--;
    if (j < 0) found.push_back(s);
    s += shift[static_cast<unsigned char>(text[s + m - 1])];
  }
  return found;
}
