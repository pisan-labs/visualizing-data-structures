#include <algorithm>
#include <optional>
#include <vector>

// reach[i][t] is true when some of the first i numbers add up to exactly t.
std::vector<std::vector<bool>> subset_sum_table(const std::vector<int>& xs, int target) {
  const std::size_t n = xs.size();
  std::vector<std::vector<bool>> reach(n + 1, std::vector<bool>(target + 1, false));
  reach[0][0] = true;
  for (std::size_t i = 1; i <= n; ++i) {
    const int x = xs[i - 1];
    for (int t = 0; t <= target; ++t) {
      reach[i][t] = reach[i - 1][t] || (x <= t && reach[i - 1][t - x]);
    }
  }
  return reach;
}

// Numbers from xs that add up to target, in their order, or nothing.
std::optional<std::vector<int>> subset_sum(const std::vector<int>& xs, int target) {
  const auto reach = subset_sum_table(xs, target);
  if (!reach[xs.size()][target]) return std::nullopt;
  std::vector<int> taken;
  int t = target;
  for (std::size_t i = xs.size(); i >= 1; --i) {
    if (!reach[i - 1][t]) {
      taken.push_back(xs[i - 1]);
      t -= xs[i - 1];
    }
  }
  std::reverse(taken.begin(), taken.end());
  return taken;
}
