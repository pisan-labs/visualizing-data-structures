#pragma once
#include <map>
#include <utility>

// Counts every call, to compare the tree with the memoized DAG.
inline long long calls = 0;

inline long long fib(int n) {
  ++calls;
  if (n <= 1) {
    return n;
  }
  long long x = fib(n - 1);
  long long y = fib(n - 2);
  return x + y;
}

// fib(n), computing each subproblem once.
inline long long fib(int n, std::map<int, long long>& memo) {
  ++calls;
  if (n <= 1) {
    return n;
  }
  if (auto known = memo.find(n); known != memo.end()) {
    return known->second;
  }
  long long x = fib(n - 1, memo);
  long long y = fib(n - 2, memo);
  return memo[n] = x + y;
}

// C(n, k): the number of ways to choose k of n things.
inline long long binomial(int n, int k) {
  ++calls;
  if (k == 0 || k == n) {
    return 1;
  }
  long long x = binomial(n - 1, k - 1);
  long long y = binomial(n - 1, k);
  return x + y;
}

// C(n, k), computing each subproblem once.
inline long long binomial(int n, int k, std::map<std::pair<int, int>, long long>& memo) {
  ++calls;
  if (k == 0 || k == n) {
    return 1;
  }
  if (auto known = memo.find({n, k}); known != memo.end()) {
    return known->second;
  }
  long long x = binomial(n - 1, k - 1, memo);
  long long y = binomial(n - 1, k, memo);
  return memo[{n, k}] = x + y;
}
