// The Z-algorithm. z[i] is the length of the longest substring starting
// at s[i] that is also a prefix of s. The box [l, r] is the match that
// reaches furthest right so far: s[l..r] == s[0..r - l].
#pragma once
#include <algorithm>
#include <string>
#include <vector>

// z[i] for every i; z[0] is left 0.
inline std::vector<int> z_array(const std::string& s) {
  const int n = static_cast<int>(s.size());
  std::vector<int> z(n, 0);
  int l = 0, r = 0;
  for (int i = 1; i < n; i++) {
    if (i <= r) z[i] = std::min(r - i + 1, z[i - l]);  // copy from the mirror
    while (i + z[i] < n && s[z[i]] == s[i + z[i]]) z[i]++;
    if (i + z[i] - 1 > r) {  // reaches further right: the new box
      l = i;
      r = i + z[i] - 1;
    }
  }
  return z;
}

// Every shift where pattern occurs in text, via z on pattern$text.
inline std::vector<int> z_search(const std::string& text, const std::string& pattern) {
  const int m = static_cast<int>(pattern.size());
  const std::vector<int> z = z_array(pattern + "$" + text);
  std::vector<int> found;
  for (int i = m + 1; i < static_cast<int>(z.size()); i++)
    if (z[i] == m) found.push_back(i - m - 1);
  return found;
}
