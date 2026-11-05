// Rabin-Karp: compare a rolling hash of each window with the pattern's
// hash, and compare characters only when the hashes agree. Digits use
// d = 10 (each character is its digit); other text uses d = 256 (each
// character is its code). q = 13, as in the visualization's default.
#pragma once

#include <algorithm>
#include <cctype>
#include <string>
#include <vector>

// Returns every shift s where pattern occurs in text.
inline std::vector<int> rabin_karp(const std::string& text, const std::string& pattern,
                                   long long q = 13) {
  const int n = static_cast<int>(text.size());
  const int m = static_cast<int>(pattern.size());
  std::vector<int> found;
  if (m > n) return found;
  auto is_digit = [](char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; };
  const bool digits = std::all_of(text.begin(), text.end(), is_digit) &&
                      std::all_of(pattern.begin(), pattern.end(), is_digit);
  const long long d = digits ? 10 : 256;
  auto value = [digits](char c) -> long long {
    return digits ? c - '0' : static_cast<unsigned char>(c);
  };
  long long h = 1;  // the weight of a window's first character: d^(m-1) mod q
  for (int k = 0; k < m - 1; k++) h = h * d % q;
  long long p = 0, t = 0;
  for (int i = 0; i < m; i++) {
    p = (d * p + value(pattern[i])) % q;
    t = (d * t + value(text[i])) % q;
  }
  for (int s = 0; s <= n - m; s++) {
    if (p == t && text.compare(s, m, pattern) == 0) found.push_back(s);  // a hit, checked
    if (s < n - m) {  // roll: drop text[s], bring in text[s + m]
      t = (d * (t - value(text[s]) * h) + value(text[s + m])) % q;
      if (t < 0) t += q;  // C++'s % can be negative
    }
  }
  return found;
}
