#pragma once

// a^b mod m by square-and-multiply, reading the bits of b from the left.
inline long long mod_pow(long long a, long long b, long long m) {
  int top = 0;
  while ((b >> (top + 1)) > 0) top++;
  long long d = 1 % m;
  for (int i = top; i >= 0; i--) {
    d = d * d % m;  // doubles the exponent so far
    if ((b >> i) & 1) {
      d = d * a % m;  // adds one to it
    }
  }
  return d;
}
