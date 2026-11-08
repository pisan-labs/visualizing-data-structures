#pragma once
#include <optional>
#include <tuple>

// gcd(a, b) for a, b >= 0: replace (a, b) with (b, a mod b) until b is 0.
inline long long euclid(long long a, long long b) {
  if (b == 0) return a;
  return euclid(b, a % b);
}

// (d, x, y) with d = gcd(a, b) = a*x + b*y.
inline std::tuple<long long, long long, long long> extended_euclid(long long a, long long b) {
  if (b == 0) return {a, 1, 0};
  auto [d, x, y] = extended_euclid(b, a % b);
  return {d, y, x - (a / b) * y};
}

// The x in 0..m-1 with a*x = 1 (mod m), or nothing when gcd(a, m) is not 1.
inline std::optional<long long> mod_inverse(long long a, long long m) {
  auto [d, x, y] = extended_euclid(a, m);
  (void)y;
  if (d != 1) return std::nullopt;
  return ((x % m) + m) % m;
}
