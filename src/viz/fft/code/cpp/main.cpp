// Test driver, one operation per line: "fft a0 a1 ..." prints each output's real and imaginary
// parts in hundredths, rounded; "multiply a0 a1 ... | b0 b1 ..." prints the product's
// coefficients.
#include <cmath>
#include <iostream>
#include <sstream>
#include <string>

#include "fft.hpp"

long long hundredths(double x) { return static_cast<long long>(std::floor(x * 100 + 0.5)); }

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, w;
    if (!(words >> op)) continue;
    if (op == "fft") {
      std::vector<cd> a;
      while (words >> w) a.push_back(std::stod(w));
      std::vector<cd> y = fft(a);
      for (std::size_t k = 0; k < y.size(); k++) {
        std::cout << (k ? " " : "") << hundredths(y[k].real()) << " " << hundredths(y[k].imag());
      }
      std::cout << "\n";
    } else if (op == "multiply") {
      std::vector<long long> a, b;
      bool second = false;
      while (words >> w) {
        if (w == "|") {
          second = true;
        } else {
          (second ? b : a).push_back(std::stoll(w));
        }
      }
      std::vector<long long> c = multiply(a, b);
      for (std::size_t k = 0; k < c.size(); k++) std::cout << (k ? " " : "") << c[k];
      std::cout << "\n";
    }
  }
  return 0;
}
