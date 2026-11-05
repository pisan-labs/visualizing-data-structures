// Test driver: reads one operation per line, prints one result per line. A space is written _.
//   build s:count ...  ->  "<total bits> <symbol>:<code> ..." in symbol order
//   encode <text>      ->  the bits
//   decode <bits>      ->  the text, or "invalid"
// Every correct Huffman tree gives the same total. The codes, and so the decoded text, also
// depend on how ties are broken: this code follows the page's default rule (leaves first, then
// the oldest merged tree), so it prints the same codes as the page with that setting.
#include <algorithm>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <string>

#include "huffman.hpp"

int main() {
  std::unique_ptr<Huffman> tree;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    if (op == "build") {
      std::map<char, int> counts;
      std::string pair;
      while (words >> pair) {
        char s = pair[0] == '_' ? ' ' : pair[0];
        counts[s] = std::stoi(pair.substr(2));
      }
      tree = std::make_unique<Huffman>(counts);
      int total = 0;
      std::string pairs;
      for (const auto& [s, code] : tree->codes()) {
        total += counts[s] * static_cast<int>(code.size());
        pairs += std::string(" ") + (s == ' ' ? '_' : s) + ":" + code;
      }
      std::cout << total << pairs << "\n";
    } else if (op == "encode") {
      std::string text;
      words >> text;
      std::replace(text.begin(), text.end(), '_', ' ');
      std::cout << tree->encode(text) << "\n";
    } else if (op == "decode") {
      std::string bits;
      words >> bits;
      auto text = tree->decode(bits);
      if (!text) {
        std::cout << "invalid\n";
      } else {
        std::replace(text->begin(), text->end(), ' ', '_');
        std::cout << *text << "\n";
      }
    }
  }
  return 0;
}
