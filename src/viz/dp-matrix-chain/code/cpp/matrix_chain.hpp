#include <limits>
#include <string>
#include <vector>

using Table = std::vector<std::vector<long long>>;

// Fills m and s for matrices A1..An, where Ak is p[k-1] x p[k]. m[i][j] is the fewest scalar
// multiplications for A(i+1)..A(j+1); s[i][j] is the split k (1-based).
void matrix_chain_order(const std::vector<int>& p, Table& m, Table& s) {
  const int n = static_cast<int>(p.size()) - 1;
  m.assign(n, std::vector<long long>(n, 0));
  s.assign(n, std::vector<long long>(n, 0));
  for (int len = 2; len <= n; ++len) {
    for (int i = 0; i + len - 1 < n; ++i) {
      const int j = i + len - 1;
      m[i][j] = std::numeric_limits<long long>::max();
      for (int k = i + 1; k <= j; ++k) {
        const long long q = m[i][k - 1] + m[k][j] + 1LL * p[i] * p[k] * p[j + 1];
        if (q < m[i][j]) {
          m[i][j] = q;
          s[i][j] = k;
        }
      }
    }
  }
}

// The best order for A(i+1)..A(j+1) as nested brackets.
std::string parens(const Table& s, int i, int j) {
  if (i == j) return "A" + std::to_string(i + 1);
  const int k = static_cast<int>(s[i][j]);
  return "(" + parens(s, i, k - 1) + parens(s, k, j) + ")";
}
