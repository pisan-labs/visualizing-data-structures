// Test driver, one line each:
//   lz77 W A text       prints the triples as (offset,length,next)
//   unlz77 triples...   prints the text
//   lzw text            prints the codes
//   unlzw codes...      prints the text
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "lz.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    words >> op;
    if (op == "lz77") {
      int w = 0, a = 0;
      std::string text;
      words >> w >> a >> text;
      const std::vector<Triple> ts = lz77(text, w, a);
      for (std::size_t k = 0; k < ts.size(); k++)
        std::cout << (k ? " " : "") << "(" << ts[k].offset << "," << ts[k].length << ","
                  << ts[k].next << ")";
      std::cout << "\n";
    } else if (op == "unlz77") {
      std::vector<Triple> ts;
      std::string t;
      while (words >> t) {
        int o = 0, n = 0;
        char c = 0;
        std::sscanf(t.c_str(), "(%d,%d,%c)", &o, &n, &c);
        ts.push_back({o, n, c});
      }
      std::cout << unlz77(ts) << "\n";
    } else if (op == "lzw") {
      std::string text;
      words >> text;
      const std::vector<int> codes = lzw(text);
      for (std::size_t k = 0; k < codes.size(); k++) std::cout << (k ? " " : "") << codes[k];
      std::cout << "\n";
    } else if (op == "unlzw") {
      std::vector<int> codes;
      int c = 0;
      while (words >> c) codes.push_back(c);
      std::cout << unlzw(codes) << "\n";
    }
  }
  return 0;
}
