// Test driver: reads one operation per line, prints one result per line. "array 2" (or
// "array 1.5", "array 4") starts an empty dynamic array with that growth rule, "counter" an
// 8-bit counter, and "charge 3" opens a bank. "append" and "increment" print the actual cost
// and the bank after it.
#include <algorithm>
#include <functional>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "amortized.hpp"

static std::function<int(int)> growth(const std::string& rule) {
  if (rule == "1.5") return [](int c) { return std::max(1, (3 * c + 1) / 2); };  // ceil(1.5 c)
  if (rule == "4") return [](int c) { return c + 4; };
  return doubling;
}

int main() {
  std::unique_ptr<DynamicArray> array;
  std::unique_ptr<BinaryCounter> counter;
  std::unique_ptr<Bank> bank;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, arg;
    if (!(words >> op)) continue;
    words >> arg;
    if (op == "array") {
      array = std::make_unique<DynamicArray>(growth(arg));
    } else if (op == "counter") {
      counter = std::make_unique<BinaryCounter>(8);
    } else if (op == "charge") {
      bank = std::make_unique<Bank>(std::stoi(arg));
    } else {
      int cost = op == "append" ? array->append(array->size() + 1) : counter->increment();
      std::cout << cost << " " << bank->pay(cost) << "\n";
    }
  }
  return 0;
}
