#pragma once
#include <algorithm>
#include <climits>
#include <optional>
#include <vector>

// The coins that pay amount with as few as possible, or nothing if it cannot be paid.
inline std::optional<std::vector<int>> fewest_coins(std::vector<int> coins, int amount) {
  std::sort(coins.begin(), coins.end());
  const int none = INT_MAX;
  std::vector<int> best(amount + 1, none);  // best[a]: the fewest coins that make a
  std::vector<int> last(amount + 1, 0);     // last[a]: the coin best[a] used last
  best[0] = 0;
  for (int a = 1; a <= amount; a++) {
    for (int c : coins) {
      if (c <= a && best[a - c] != none && best[a - c] + 1 < best[a]) {
        best[a] = best[a - c] + 1;
        last[a] = c;
      }
    }
  }
  if (best[amount] == none) return std::nullopt;
  std::vector<int> paid;
  for (int a = amount; a > 0; a -= last[a]) paid.push_back(last[a]);
  return paid;
}

// How many ways there are to make amount, ignoring the order of the coins.
inline long long count_ways(std::vector<int> coins, int amount) {
  std::sort(coins.begin(), coins.end());
  std::vector<long long> ways(amount + 1, 0);  // one row of the table, one coin at a time
  ways[0] = 1;
  for (int c : coins)
    for (int a = c; a <= amount; a++) ways[a] += ways[a - c];
  return ways[amount];
}
