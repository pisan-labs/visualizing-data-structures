#pragma once
#include <algorithm>
#include <cstddef>
#include <string>
#include <vector>

// d[i][j] is the cheapest way to turn a[0..i) into b[0..j).
inline std::vector<std::vector<int>> edit_table(const std::string& a, const std::string& b, int ins,
                                                int del, int sub) {
  const std::size_t m = a.size();
  const std::size_t n = b.size();
  std::vector<std::vector<int>> d(m + 1, std::vector<int>(n + 1, 0));
  for (std::size_t i = 0; i <= m; i++) d[i][0] = static_cast<int>(i) * del;
  for (std::size_t j = 0; j <= n; j++) d[0][j] = static_cast<int>(j) * ins;
  for (std::size_t i = 1; i <= m; i++) {
    for (std::size_t j = 1; j <= n; j++) {
      const int cost = a[i - 1] == b[j - 1] ? 0 : sub;
      d[i][j] = std::min({d[i - 1][j - 1] + cost, d[i - 1][j] + del, d[i][j - 1] + ins});
    }
  }
  return d;
}

inline int edit_distance(const std::string& a, const std::string& b, int ins, int del, int sub) {
  return edit_table(a, b, ins, del, sub)[a.size()][b.size()];
}

// The edits from left to right: M match, S substitute, D delete, I insert.
inline std::string alignment(const std::string& a, const std::string& b, int ins, int del,
                             int sub) {
  const auto d = edit_table(a, b, ins, del, sub);
  std::size_t i = a.size();
  std::size_t j = b.size();
  std::string ops;
  while (i > 0 || j > 0) {
    const bool same = i > 0 && j > 0 && a[i - 1] == b[j - 1];
    if (i > 0 && j > 0 && d[i][j] == d[i - 1][j - 1] + (same ? 0 : sub)) {
      ops += same ? 'M' : 'S';
      i--;
      j--;
    } else if (i > 0 && d[i][j] == d[i - 1][j] + del) {
      ops += 'D';
      i--;
    } else {
      ops += 'I';
      j--;
    }
  }
  std::reverse(ops.begin(), ops.end());
  return ops;
}
