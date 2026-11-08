#pragma once
#include <cmath>
#include <complex>
#include <vector>

using cd = std::complex<double>;

// The DFT of a (size a power of 2): a's polynomial at the nth roots of unity.
inline std::vector<cd> fft(const std::vector<cd>& a, bool inverse = false) {
  std::size_t n = a.size();
  if (n == 1) return a;
  std::vector<cd> even(n / 2), odd(n / 2);
  for (std::size_t i = 0; i < n / 2; i++) {
    even[i] = a[2 * i];
    odd[i] = a[2 * i + 1];
  }
  std::vector<cd> y0 = fft(even, inverse), y1 = fft(odd, inverse), y(n);
  double sign = inverse ? -1 : 1;
  for (std::size_t k = 0; k < n / 2; k++) {
    cd w = std::polar(1.0, sign * 2 * M_PI * k / n);  // omega_n^k
    y[k] = y0[k] + w * y1[k];
    y[k + n / 2] = y0[k] - w * y1[k];
  }
  return y;
}

// The coefficients of a(x) * b(x): evaluate, multiply point by point, interpolate.
inline std::vector<long long> multiply(const std::vector<long long>& a,
                                       const std::vector<long long>& b) {
  std::size_t size = a.size() + b.size() - 1, n = 2;
  while (n < size) n *= 2;
  std::vector<cd> fa(n), fb(n);
  for (std::size_t i = 0; i < a.size(); i++) fa[i] = static_cast<double>(a[i]);
  for (std::size_t i = 0; i < b.size(); i++) fb[i] = static_cast<double>(b[i]);
  fa = fft(fa);
  fb = fft(fb);
  std::vector<cd> c(n);
  for (std::size_t k = 0; k < n; k++) c[k] = fa[k] * fb[k];
  c = fft(c, true);
  std::vector<long long> out(size);
  for (std::size_t k = 0; k < size; k++) out[k] = std::llround(c[k].real() / n);
  return out;
}
