#pragma once
#include <optional>
#include <vector>

// Every subset of values, taking or skipping each value in turn: choose, explore, unchoose.
// With a target (values > 0), only the subsets with that sum, and branches that cannot reach
// it are pruned.
inline std::vector<std::vector<int>> subsets(const std::vector<int>& values,
                                             std::optional<int> target = std::nullopt) {
  std::vector<std::vector<int>> out;
  std::vector<int> chosen;
  std::vector<int> rest(values.size() + 1, 0);
  for (int i = static_cast<int>(values.size()) - 1; i >= 0; i--) rest[i] = rest[i + 1] + values[i];

  auto search = [&](auto& self, std::size_t i, int total) -> void {
    if (target && (total > *target || total + rest[i] < *target)) return;  // prune
    if (i == values.size()) {
      out.push_back(chosen);
      return;
    }
    chosen.push_back(values[i]);               // choose
    self(self, i + 1, total + values[i]);      // explore
    chosen.pop_back();                         // unchoose
    self(self, i + 1, total);                  // explore without it
  };
  search(search, 0, 0);
  return out;
}

// Every order of values: choose an unused value, explore, unchoose.
inline std::vector<std::vector<int>> permutations(const std::vector<int>& values) {
  std::vector<std::vector<int>> out;
  std::vector<int> chosen;
  std::vector<bool> used(values.size(), false);

  auto search = [&](auto& self) -> void {
    if (chosen.size() == values.size()) {
      out.push_back(chosen);
      return;
    }
    for (std::size_t k = 0; k < values.size(); k++) {
      if (used[k]) continue;
      used[k] = true;
      chosen.push_back(values[k]);  // choose
      self(self);                   // explore
      chosen.pop_back();            // unchoose
      used[k] = false;
    }
  };
  search(search);
  return out;
}
