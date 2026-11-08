#pragma once
#include <vector>

// The primes up to n (n >= 2) by the sieve of Eratosthenes.
inline std::vector<int> sieve(int n) {
  std::vector<bool> crossed(n + 1, false);
  for (int p = 2; p * p <= n; p++) {
    if (crossed[p]) continue;
    for (int j = p * p; j <= n; j += p) crossed[j] = true;
  }
  std::vector<int> primes;
  for (int k = 2; k <= n; k++) {
    if (!crossed[k]) primes.push_back(k);
  }
  return primes;
}
