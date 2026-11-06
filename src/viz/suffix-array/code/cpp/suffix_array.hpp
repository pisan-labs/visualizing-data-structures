#pragma once
#include <algorithm>
#include <string>
#include <utility>
#include <vector>

// Start positions of the suffixes of t in sorted order, by prefix doubling.
inline std::vector<int> suffixArray(const std::string& t) {
  int n = static_cast<int>(t.size());
  std::vector<int> sa(n), rank(n), next(n);
  for (int i = 0; i < n; i++) {
    sa[i] = i;
    rank[i] = static_cast<unsigned char>(t[i]);
  }
  for (int k = 1;; k *= 2) {
    // Sort by the first 2k characters: a pair of ranks, -1 past the end.
    auto key = [&](int i) { return std::make_pair(rank[i], i + k < n ? rank[i + k] : -1); };
    std::sort(sa.begin(), sa.end(), [&](int a, int b) { return key(a) < key(b); });
    next[sa[0]] = 0;
    for (int i = 1; i < n; i++) next[sa[i]] = next[sa[i - 1]] + (key(sa[i - 1]) < key(sa[i]));
    rank = next;
    if (rank[sa[n - 1]] == n - 1) return sa;  // every rank differs: sorted
  }
}

// Kasai: lcp[r] is the longest common prefix of rows r - 1 and r (lcp[0] = 0).
inline std::vector<int> lcpArray(const std::string& t, const std::vector<int>& sa) {
  int n = static_cast<int>(t.size());
  std::vector<int> rank(n), lcp(n, 0);
  for (int r = 0; r < n; r++) rank[sa[r]] = r;
  int h = 0;
  for (int i = 0; i < n; i++) {
    if (rank[i] == 0) {
      h = 0;
      continue;
    }
    int j = sa[rank[i] - 1];
    while (i + h < n && j + h < n && t[i + h] == t[j + h]) h++;
    lcp[rank[i]] = h;
    if (h > 0) h--;
  }
  return lcp;
}

// Positions where p occurs in t, in increasing order: two binary searches.
inline std::vector<int> search(const std::string& t, const std::vector<int>& sa,
                               const std::string& p) {
  auto cmp = [&](int r) { return t.compare(sa[r], p.size(), p); };  // first |p| characters
  int lo = 0, hi = static_cast<int>(sa.size());
  while (lo < hi) {  // the first row not smaller than p
    int mid = (lo + hi) / 2;
    if (cmp(mid) < 0) lo = mid + 1;
    else hi = mid;
  }
  int first = lo;
  hi = static_cast<int>(sa.size());
  while (lo < hi) {  // the first row past the ones that start with p
    int mid = (lo + hi) / 2;
    if (cmp(mid) <= 0) lo = mid + 1;
    else hi = mid;
  }
  std::vector<int> found(sa.begin() + first, sa.begin() + lo);
  std::sort(found.begin(), found.end());
  return found;
}

// The longest substring that occurs at least twice ("" if none).
inline std::string longestRepeat(const std::string& t, const std::vector<int>& sa,
                                 const std::vector<int>& lcp) {
  size_t best = 0;
  for (size_t r = 1; r < lcp.size(); r++)
    if (lcp[r] > lcp[best]) best = r;
  return t.substr(sa[best], lcp[best]);
}
