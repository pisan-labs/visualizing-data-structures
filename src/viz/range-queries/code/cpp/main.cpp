// Test driver: reads one operation per line, prints one line per query result.
//   build 5 3 8 1  |  sum i j  |  min i j  |  update i x
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "range_queries.hpp"

int main() {
  std::unique_ptr<PrefixSums> sums;
  std::unique_ptr<SparseTable> table;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> args;
    int x;
    while (words >> x) args.push_back(x);
    if (op == "build") {
      sums = std::make_unique<PrefixSums>(args);
      table = std::make_unique<SparseTable>(args);
    } else if (op == "sum") {
      std::cout << sums->sum(args[0], args[1]) << "\n";
    } else if (op == "min") {
      std::cout << table->min(args[0], args[1]) << "\n";
    } else if (op == "update") {
      sums->update(args[0], args[1]);
      table->update(args[0], args[1]);
    }
  }
  return 0;
}
