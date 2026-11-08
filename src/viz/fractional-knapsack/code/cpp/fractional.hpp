#include <algorithm>
#include <numeric>
#include <utility>
#include <vector>

// The most value that fits in capacity W when items (weight, value) can be cut. Returns it as a
// fraction (numerator, denominator) in lowest terms.
std::pair<long long, long long> fractional_knapsack(std::vector<std::pair<int, int>> items,
                                                    int capacity) {
  // Best value per weight first: v1/w1 > v2/w2 without dividing. Stable for ties.
  std::stable_sort(items.begin(), items.end(), [](const auto& a, const auto& b) {
    return 1LL * a.second * b.first > 1LL * b.second * a.first;
  });
  long long num = 0, den = 1;
  int left = capacity;
  for (const auto& [w, v] : items) {
    if (left == 0) break;
    const int part = std::min(w, left);  // all of it, or the part that fits
    num = num * w + 1LL * v * part * den;
    den *= w;
    const long long g = std::gcd(num, den);
    num /= g;
    den /= g;
    left -= part;
  }
  return {num, den};
}
