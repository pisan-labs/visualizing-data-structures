// Test driver: reads one operation per line, prints one result per line.
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "grid_bfs.hpp"

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream words(line);
    std::string op, moves, row;
    if (!(words >> op >> moves) || op != "bfs") continue;
    std::vector<std::string> grid;
    while (words >> row) grid.push_back(row);
    int cols = static_cast<int>(grid[0].size());
    GridPath r = gridBfs(grid, moves == "8");
    if (r.path.empty()) {
      std::cout << "none " << r.expanded << '\n';
      continue;
    }
    std::cout << r.path.size() - 1 << ' ' << r.expanded;
    for (int k : r.path) std::cout << ' ' << static_cast<char>('A' + k % cols) << k / cols + 1;
    std::cout << '\n';
  }
}
