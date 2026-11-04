#pragma once
#include <string>
#include <utility>

// The reverse of s: reverse everything after the first character, then add it.
inline std::string reverse(const std::string& s) {
  if (s.size() <= 1) {
    return s;
  }
  return reverse(s.substr(1)) + s[0];
}

// Reverse the characters of a between indices i and j by swapping the ends, then the inside.
inline void reverse_in_place(std::string& a, int i, int j) {
  if (i >= j) {
    return;
  }
  std::swap(a[i], a[j]);
  reverse_in_place(a, i + 1, j - 1);
}
