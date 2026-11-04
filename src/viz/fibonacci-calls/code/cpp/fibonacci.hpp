#pragma once
#include <unordered_map>

// Counts every call, to show how much work each version does.
inline long long calls = 0;

// fib(n) the slow way: every call above the base cases makes two more.
inline long long fib(int n) {
  ++calls;
  if (n <= 1) {
    return n;
  }
  long long x = fib(n - 1);
  long long y = fib(n - 2);
  return x + y;
}

// The same recursion, but each answer is computed once and kept in memo.
inline long long fib_memo(int n, std::unordered_map<int, long long>& memo) {
  ++calls;
  if (n <= 1) {
    return n;
  }
  auto known = memo.find(n);
  if (known != memo.end()) {
    return known->second;
  }
  long long x = fib_memo(n - 1, memo);
  long long y = fib_memo(n - 2, memo);
  memo[n] = x + y;
  return memo[n];
}
