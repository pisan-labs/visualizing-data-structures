#pragma once
#include <numeric>
#include <stdexcept>

// Toy RSA: the arithmetic is right, but numbers this small are broken in a blink.

// a^b mod m by square-and-multiply.
inline long long mod_pow(long long a, long long b, long long m) {
  long long result = 1 % m;
  a %= m;
  for (; b > 0; b >>= 1) {
    if (b & 1) result = result * a % m;
    a = a * a % m;
  }
  return result;
}

// The inverse of e mod phi, by extended Euclid (iterative).
inline long long mod_inverse(long long e, long long phi) {
  long long r0 = phi, r1 = e, t0 = 0, t1 = 1;
  while (r1 != 0) {
    long long q = r0 / r1;
    long long r = r0 - q * r1, t = t0 - q * t1;
    r0 = r1, r1 = r, t0 = t1, t1 = t;
  }
  if (r0 != 1) throw std::invalid_argument("e must be coprime to phi");
  return ((t0 % phi) + phi) % phi;
}

struct Rsa {
  long long n, e, d;

  // Keys from distinct primes p and q; e = 0 picks the smallest e that works.
  Rsa(long long p, long long q, long long e0 = 0) {
    long long phi = (p - 1) * (q - 1);
    n = p * q;
    e = e0;
    if (e == 0) {
      e = 2;
      while (std::gcd(e, phi) != 1) e++;
    }
    d = mod_inverse(e, phi);
  }

  long long encrypt(long long m) const { return mod_pow(m, e, n); }  // m < n
  long long decrypt(long long c) const { return mod_pow(c, d, n); }
};
