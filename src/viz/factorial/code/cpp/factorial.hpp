#pragma once

// n! for n >= 0. Each call waits for factorial(n - 1), then multiplies.
inline long long factorial(int n) {
  if (n == 0) {
    return 1;
  }
  return n * factorial(n - 1);
}

// n! with an accumulator: the recursive call is the last thing it does (a tail call).
// The C++ standard does not require tail calls to reuse the frame; compilers may when
// optimizing, so do not count on it.
inline long long factorial_tail(int n, long long acc = 1) {
  if (n == 0) {
    return acc;
  }
  return factorial_tail(n - 1, n * acc);
}
