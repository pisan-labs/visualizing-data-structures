// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <memory>
#include <set>
#include <sstream>
#include <string>

#include "bloom_filter.hpp"

int main() {
  std::unique_ptr<BloomFilter> bloom;
  std::set<int> inserted;  // only to measure false positives
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    int a = 0, b = 0;
    words >> a >> b;
    if (op == "new") {
      bloom = std::make_unique<BloomFilter>(a, b);
    } else if (op == "insert") {
      bloom->insert(a);
      inserted.insert(a);
      const char* sep = "";
      for (int j : bloom->positions(a)) {
        std::cout << sep << j;
        sep = " ";
      }
      std::cout << "\n";
    } else if (op == "query") {
      std::cout << (bloom->query(a) ? "maybe" : "no") << "\n";
    } else if (op == "delete") {
      std::cout << "unsupported\n";
    } else if (op == "measure") {
      int fp = 0, absent = 0;
      for (int x = 0; x < 1000; x++) {
        if (inserted.count(x)) continue;
        absent++;
        if (bloom->query(x)) fp++;
      }
      std::cout << fp << " " << absent << "\n";
    } else if (op == "clear") {
      bloom->clear();
      inserted.clear();
      std::cout << "ok\n";
    }
  }
  return 0;
}
