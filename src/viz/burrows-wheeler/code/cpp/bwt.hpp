// The Burrows-Wheeler transform: sort every rotation of text + "$" and
// read the last column. The inverse needs only that column: the k-th
// copy of a character in L is the k-th copy in F = sorted(L).
#pragma once
#include <algorithm>
#include <map>
#include <string>
#include <utility>
#include <vector>

inline std::string rotation(const std::string& s, int k) { return s.substr(k) + s.substr(0, k); }

// Rotation starts in sorted order; ties keep their order.
inline std::vector<int> sorted_rotations(const std::string& s) {
  std::vector<int> rows(s.size());
  for (int k = 0; k < static_cast<int>(s.size()); k++) rows[k] = k;
  std::stable_sort(rows.begin(), rows.end(),
                   [&](int a, int b) { return rotation(s, a) < rotation(s, b); });
  return rows;
}

inline std::string last_column(const std::string& s, const std::vector<int>& rows) {
  std::string last;
  for (int k : rows) last += s[(k + s.size() - 1) % s.size()];
  return last;
}

// The last column of the sorted rotations of text + '$'.
inline std::string bwt(const std::string& text) {
  const std::string s = text + "$";
  return last_column(s, sorted_rotations(s));
}

// lf[r]: the row of F holding the same copy of the character last[r].
inline std::vector<int> lf_mapping(const std::string& last) {
  std::string first = last;
  std::sort(first.begin(), first.end());
  std::map<char, int> start, seen;
  for (int r = static_cast<int>(first.size()) - 1; r >= 0; r--) start[first[r]] = r;
  std::vector<int> lf;
  for (char c : last) lf.push_back(start[c] + seen[c]++);
  return lf;
}

inline std::string walk(const std::string& last, int row, int steps) {
  const std::vector<int> lf = lf_mapping(last);
  std::string text;
  for (int i = 0; i < steps; i++) {
    text.insert(text.begin(), last[row]);  // last[row] comes just before first[row]
    row = lf[row];
  }
  return text;
}

// The text whose transform is last (which holds one '$'): start at the row "$" + text.
inline std::string inverse_bwt(const std::string& last) {
  return walk(last, 0, static_cast<int>(last.size()) - 1);
}

// Without an end marker: the last column and the row of text.
inline std::pair<std::string, int> bwt_index(const std::string& text) {
  const std::vector<int> rows = sorted_rotations(text);
  const int index = static_cast<int>(std::find(rows.begin(), rows.end(), 0) - rows.begin());
  return {last_column(text, rows), index};
}

inline std::string inverse_bwt_index(const std::string& last, int index) {
  return walk(last, index, static_cast<int>(last.size()));
}
