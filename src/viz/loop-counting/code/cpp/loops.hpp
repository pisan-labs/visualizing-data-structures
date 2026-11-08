#pragma once

#include <vector>

// Loop patterns. Each returns how many times its innermost line runs.

inline long long single(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++) count++;
  return count;
}

inline long long nested(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++)
    for (int j = 1; j <= n; j++) count++;
  return count;
}

inline long long triangle(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++)
    for (int j = i; j <= n; j++) count++;
  return count;
}

inline long long pairs(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++)
    for (int j = 1; j < i; j++) count++;
  return count;
}

inline long long sequence(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++) count++;
  for (int j = 1; j <= n; j++) count++;  // starts after the first loop ends
  return count;
}

inline long long halving(int n) {
  long long count = 0;
  for (int i = n; i > 1; i /= 2) count++;
  return count;
}

inline long long squareRoot(int n) {
  long long count = 0;
  for (int i = 1; i * i <= n; i++) count++;
  return count;
}

inline long long doubling(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++)
    for (int j = 1; j <= n; j *= 2) count++;
  return count;
}

inline long long geometric(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i *= 2)
    for (int j = 1; j <= i; j++) count++;
  return count;
}

// Looks for x in a and returns the number of comparisons made.
inline long long search(const std::vector<int>& a, int x) {
  long long count = 0;
  for (int item : a) {
    count++;
    if (item == x) return count;  // the early exit
  }
  return count;
}

inline long long triple(int n) {
  long long count = 0;
  for (int i = 1; i <= n; i++)
    for (int j = i; j <= n; j++)
      for (int k = j; k <= n; k++) count++;
  return count;
}
