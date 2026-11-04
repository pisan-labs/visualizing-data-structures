// Test driver: "subsets 1 2 3", "target 5 1 2 3 4" or "permutations 1 2 3", one per line.
// Prints the outputs in the order the search finds them, such as "[1,2] [1] [2] []".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "backtracking.hpp"

static std::string show(const std::vector<std::vector<int>>& lists) {
  std::string line;
  for (std::size_t k = 0; k < lists.size(); k++) {
    if (k) line += " ";
    line += "[";
    for (std::size_t i = 0; i < lists[k].size(); i++) {
      if (i) line += ",";
      line += std::to_string(lists[k][i]);
    }
    line += "]";
  }
  return line;
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op;
    if (!(words >> op)) continue;
    std::vector<int> nums;
    for (int v; words >> v;) nums.push_back(v);
    if (op == "subsets") {
      std::cout << show(subsets(nums)) << "\n";
    } else if (op == "target") {
      std::vector<int> values(nums.begin() + 1, nums.end());
      std::cout << show(subsets(values, nums[0])) << "\n";
    } else if (op == "permutations") {
      std::cout << show(permutations(nums)) << "\n";
    }
  }
  return 0;
}
