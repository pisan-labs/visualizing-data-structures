#include <utility>
#include <vector>

// Bottom-up: r[j] is the best revenue for length j and s[j] the first piece of a best cut.
// p[i] is the price of a piece of length i (p[0] is unused).
std::pair<std::vector<int>, std::vector<int>> cut_rod_table(const std::vector<int>& p) {
  const int n = static_cast<int>(p.size()) - 1;
  std::vector<int> r(n + 1, 0), s(n + 1, 0);
  for (int j = 1; j <= n; ++j) {
    int q = -1;
    for (int i = 1; i <= j; ++i) {
      if (q < p[i] + r[j - i]) {
        q = p[i] + r[j - i];
        s[j] = i;
      }
    }
    r[j] = q;
  }
  return {r, s};
}

// The pieces of a best cut, first piece first.
std::vector<int> cut_rod_pieces(const std::vector<int>& s, int n) {
  std::vector<int> pieces;
  while (n > 0) {
    pieces.push_back(s[n]);
    n -= s[n];
  }
  return pieces;
}
