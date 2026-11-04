#pragma once
#include <cstdlib>
#include <vector>

// N-Queens by backtracking: one queen per row, taken back at dead ends.
// Returns the solutions found, as columns per row: the first one, or all of them.
inline std::vector<std::vector<int>> solve_queens(int n, bool first_only = true) {
  std::vector<int> queens;  // queens[r] is the column of the queen in row r
  std::vector<std::vector<int>> solutions;

  auto safe = [&](int row, int col) {
    for (int r = 0; r < row; r++) {
      if (queens[r] == col || std::abs(queens[r] - col) == row - r) return false;
    }
    return true;
  };

  auto place = [&](auto& self, int row) -> bool {
    if (row == n) {
      solutions.push_back(queens);
      return first_only;
    }
    for (int col = 0; col < n; col++) {
      if (safe(row, col)) {
        queens.push_back(col);
        if (self(self, row + 1)) return true;
        queens.pop_back();
      }
    }
    return false;
  };

  place(place, 0);
  return solutions;
}
