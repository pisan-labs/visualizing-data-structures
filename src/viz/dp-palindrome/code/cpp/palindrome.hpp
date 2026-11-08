#include <algorithm>
#include <string>
#include <vector>

// L[i][j] is the length of the longest palindromic subsequence of s[i..j].
std::vector<std::vector<int>> lps_table(const std::string& s) {
  const int n = static_cast<int>(s.size());
  std::vector<std::vector<int>> L(n, std::vector<int>(n, 0));
  for (int i = 0; i < n; ++i) L[i][i] = 1;
  for (int len = 2; len <= n; ++len) {
    for (int i = 0; i + len - 1 < n; ++i) {
      const int j = i + len - 1;
      if (s[i] == s[j])
        L[i][j] = (len > 2 ? L[i + 1][j - 1] : 0) + 2;
      else
        L[i][j] = std::max(L[i + 1][j], L[i][j - 1]);
    }
  }
  return L;
}

// One longest palindromic subsequence, walking in from both ends.
std::string longest_palindrome(const std::string& s) {
  const auto L = lps_table(s);
  std::string left, right;
  int i = 0, j = static_cast<int>(s.size()) - 1;
  while (i <= j) {
    if (i == j) {
      left += s[i++];  // the middle
    } else if (s[i] == s[j]) {
      left += s[i++];
      right += s[j--];
    } else if (L[i + 1][j] >= L[i][j - 1]) {
      ++i;  // drop the left end
    } else {
      --j;  // drop the right end
    }
  }
  std::reverse(right.begin(), right.end());
  return left + right;
}
