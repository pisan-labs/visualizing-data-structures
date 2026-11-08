// Test driver: reads "keys p q" and "use-e e" (print "n e d"), "encrypt m" and "decrypt c"
// (print the result), one per line.
#include <iostream>
#include <sstream>
#include <string>

#include "rsa.hpp"

int main() {
  std::string line;
  Rsa rsa(3, 5);
  long long p = 3, q = 5;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    long long x = 0;
    if (!(words >> op >> x)) continue;
    if (op == "keys") {
      p = x;
      words >> q;
      rsa = Rsa(p, q);
      std::cout << rsa.n << " " << rsa.e << " " << rsa.d << "\n";
    } else if (op == "use-e") {
      rsa = Rsa(p, q, x);
      std::cout << rsa.n << " " << rsa.e << " " << rsa.d << "\n";
    } else if (op == "encrypt") {
      std::cout << rsa.encrypt(x) << "\n";
    } else if (op == "decrypt") {
      std::cout << rsa.decrypt(x) << "\n";
    }
  }
  return 0;
}
