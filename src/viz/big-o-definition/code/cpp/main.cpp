// Test driver: reads one operation per line, prints one result per line.
//   check p q n0 n_max ; F ; G   -> first n that breaks f <= (p/q)*g, or none
//   find p q n_max ; F ; G       -> smallest n0, or none
// F and G are terms k:a:b:e:x, meaning k * n^a * lg(n)^b * (2^n)^e * (n!)^x.
#include <array>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "witness.hpp"

Fn function(const std::string& terms) {
  std::vector<std::array<long long, 5>> parts;
  std::istringstream in(terms);
  std::string t;
  while (in >> t) {
    std::array<long long, 5> p{};
    std::istringstream fields(t);
    std::string v;
    for (auto& x : p) {
      std::getline(fields, v, ':');
      x = std::stoll(v);
    }
    parts.push_back(p);
  }
  return [parts](long long n) {
    long long sum = 0;
    for (const auto& p : parts) {
      long long v = p[0];
      for (long long i = 0; i < p[1]; ++i) v *= n;
      for (long long i = 0; i < p[2]; ++i) v *= lg(n);
      if (p[3] == 1) v *= 1LL << n;
      if (p[4] == 1)
        for (long long i = 2; i <= n; ++i) v *= i;
      sum += v;
    }
    return sum;
  };
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.find(';') == std::string::npos) continue;
    std::size_t a = line.find(';');
    std::size_t b = line.find(';', a + 1);
    Fn f = function(line.substr(a + 1, b - a - 1));
    Fn g = function(line.substr(b + 1));
    std::istringstream head(line.substr(0, a));
    std::string op;
    long long p = 0, q = 0, x = 0, y = 0;
    head >> op >> p >> q >> x;
    std::optional<long long> n;
    if (op == "check") {
      head >> y;
      n = first_failure(f, g, p, q, x, y);
    } else {
      n = smallest_n0(f, g, p, q, x);
    }
    if (n)
      std::cout << *n << "\n";
    else
      std::cout << "none\n";
  }
  return 0;
}
