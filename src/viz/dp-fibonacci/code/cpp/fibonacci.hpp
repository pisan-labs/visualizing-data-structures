#pragma once
#include <optional>
#include <vector>

// F(n) bottom-up: fill F[0..n] from the base cases.
inline long long fib(int n) {
  std::vector<long long> f(n + 1, 0);
  if (n > 0) f[1] = 1;
  for (int i = 2; i <= n; i++) f[i] = f[i - 1] + f[i - 2];
  return f[n];
}

inline long long memo_fib(int k, std::vector<std::optional<long long>>& memo) {
  if (!memo[k]) memo[k] = k <= 1 ? k : memo_fib(k - 1, memo) + memo_fib(k - 2, memo);
  return *memo[k];
}

// F(n) top-down: recurse, but remember every answer in a memo.
inline long long fib_memo(int n) {
  std::vector<std::optional<long long>> memo(n + 1);
  return memo_fib(n, memo);
}
