#pragma once
#include <algorithm>
#include <cstddef>
#include <string>
#include <vector>

// c[i][j] is the length of an LCS of x[0..i) and y[0..j).
inline std::vector<std::vector<int>> lcs_table(const std::string& x, const std::string& y) {
  const std::size_t m = x.size();
  const std::size_t n = y.size();
  std::vector<std::vector<int>> c(m + 1, std::vector<int>(n + 1, 0));
  for (std::size_t i = 1; i <= m; i++) {
    for (std::size_t j = 1; j <= n; j++) {
      if (x[i - 1] == y[j - 1]) {
        c[i][j] = c[i - 1][j - 1] + 1;
      } else {
        c[i][j] = std::max(c[i - 1][j], c[i][j - 1]);
      }
    }
  }
  return c;
}

// One longest common subsequence of x and y. On a tie the walk goes up, as in CLRS.
inline std::string lcs(const std::string& x, const std::string& y) {
  const auto c = lcs_table(x, y);
  std::size_t i = x.size();
  std::size_t j = y.size();
  std::string taken;
  while (i > 0 && j > 0) {
    if (x[i - 1] == y[j - 1]) {
      taken += x[i - 1];
      i--;
      j--;
    } else if (c[i - 1][j] >= c[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  std::reverse(taken.begin(), taken.end());
  return taken;
}
