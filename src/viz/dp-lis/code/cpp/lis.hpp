#include <algorithm>
#include <vector>

std::vector<int> lis_walk_back(const std::vector<int>& a, const std::vector<int>& prev, int i) {
  std::vector<int> out;
  for (; i != -1; i = prev[i]) out.push_back(a[i]);
  std::reverse(out.begin(), out.end());
  return out;
}

// O(n^2): length[i] is the longest increasing run ending at a[i]; prev[i] the index before.
std::vector<int> lis_table(const std::vector<int>& a) {
  const int n = static_cast<int>(a.size());
  std::vector<int> length(n, 1), prev(n, -1);
  int end = 0;
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < i; ++j) {
      if (a[j] < a[i] && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        prev[i] = j;
      }
    }
    if (length[i] > length[end]) end = i;
  }
  return lis_walk_back(a, prev, end);
}

// O(n log n): tails[k] is the index of the smallest value ending a run of length k + 1.
std::vector<int> lis_tails(const std::vector<int>& a) {
  std::vector<int> tails, prev(a.size(), -1);
  for (int i = 0; i < static_cast<int>(a.size()); ++i) {
    // The first tail >= a[i].
    const auto it = std::lower_bound(tails.begin(), tails.end(), a[i],
                                     [&](int t, int x) { return a[t] < x; });
    const auto k = it - tails.begin();
    prev[i] = k > 0 ? tails[k - 1] : -1;
    if (it == tails.end())
      tails.push_back(i);
    else
      *it = i;
  }
  return lis_walk_back(a, prev, tails.back());
}
