// Manacher's algorithm. With a separator between the characters and at
// both ends, every palindrome has a center cell, and p[i] is the radius of
// the longest palindrome centered at t[i] (its length in s). c and r mark
// the palindrome that reaches furthest right: r = c + p[c].
#pragma once
#include <algorithm>
#include <string>
#include <vector>

// p[i] for every cell of t = "#" + s with '#' between characters + "#".
inline std::vector<int> radii(const std::string& s) {
  std::string t = "#";
  for (char ch : s) {
    t += ch;
    t += '#';
  }
  const int n = static_cast<int>(t.size());
  std::vector<int> p(n, 0);
  int c = 0, r = 0;
  for (int i = 0; i < n; i++) {
    if (i < r) p[i] = std::min(r - i, p[2 * c - i]);  // copy the mirror's radius
    while (i - p[i] - 1 >= 0 && i + p[i] + 1 < n && t[i - p[i] - 1] == t[i + p[i] + 1]) p[i]++;
    if (i + p[i] > r) {  // reaches further right: the new one to mirror
      c = i;
      r = i + p[i];
    }
  }
  return p;
}

// The longest palindromic substring of s (the leftmost on ties).
inline std::string longest_palindrome(const std::string& s) {
  const std::vector<int> p = radii(s);
  int best = 0;
  for (int i = 1; i < static_cast<int>(p.size()); i++)
    if (p[i] > p[best]) best = i;
  return s.substr((best - p[best]) / 2, p[best]);
}
