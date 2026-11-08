// Test driver: reads one operation per line, prints one result per line. "run insertion 100 800
// 4821" runs the doubling loop from n = 100 to 800 on seed 4821's inputs and prints "n T b" for
// each size ("-" for the first b). "count insertion 20000 4821" prints the step count at one
// size. Inputs: n values from mulberry32(seed + n), each in [-999999, 999999], the same
// generator the page uses; binary search gets them sorted.
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "doubling.hpp"

std::vector<int> makeInput(const std::string& name, int n, long long seed) {
  std::uint32_t state = static_cast<std::uint32_t>(seed + n);
  std::vector<int> a(n);
  for (int i = 0; i < n; i++) {
    state += 0x6D2B79F5u;
    std::uint32_t t = state;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    std::uint64_t u = t ^ (t >> 14);
    a[i] = static_cast<int>(-999999 + static_cast<long long>((u * 1999999u) >> 32));
  }
  if (name == "binary") std::sort(a.begin(), a.end());
  return a;
}

int main() {
  const std::map<std::string, Algorithm> algorithms = {
      {"linear", linearSearch},
      {"binary", binarySearch},
      {"hash", distinctValues},
      {"merge", [](std::vector<int>& a) { return mergeSort(a); }},
      {"insertion", insertionSort},
      {"threesum", [](std::vector<int>& a) { return threeSum(a).second; }},
  };
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, name;
    if (!(words >> op >> name)) continue;
    const Algorithm& algorithm = algorithms.at(name);
    if (op == "run") {
      int n = 0, largest = 0;
      long long seed = 0;
      words >> n >> largest >> seed;
      auto input = [&](int m) { return makeInput(name, m, seed); };
      for (const Row& r : doubling(algorithm, input, n, largest)) {
        std::cout << r.n << ' ' << r.t << ' ';
        if (r.b) {
          char b[32];
          std::snprintf(b, sizeof b, "%.2f", *r.b);
          std::cout << b << '\n';
        } else {
          std::cout << "-\n";
        }
      }
    } else {
      int n = 0;
      long long seed = 0;
      words >> n >> seed;
      std::vector<int> a = makeInput(name, n, seed);
      std::cout << algorithm(a) << '\n';
    }
  }
  return 0;
}
