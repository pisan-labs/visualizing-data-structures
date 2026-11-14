#pragma once
#include <algorithm>
#include <climits>
#include <optional>
#include <string>
#include <utility>
#include <vector>

constexpr char WALL = '#';
constexpr int INF = INT_MAX / 2;  // no way in; adding a cost stays below overflow

// Paths from the top left to the bottom right, moving right or down. '#' is a wall.
inline long long countPaths(const std::vector<std::string>& grid) {
    const int rows = grid.size(), cols = grid[0].size();
    std::vector<std::vector<long long>> p(rows, std::vector<long long>(cols, 0));
    for (int r = 0; r < rows; ++r)
        for (int c = 0; c < cols; ++c) {
            if (grid[r][c] == WALL) continue;  // no path goes through a wall
            if (r == 0 && c == 0) p[r][c] = 1;
            else p[r][c] = (r > 0 ? p[r - 1][c] : 0) + (c > 0 ? p[r][c - 1] : 0);
        }
    return p[rows - 1][cols - 1];
}

// The cheapest path's cost and its moves (D down, R right), paying each cell's digit;
// nothing if walls block every path.
inline std::optional<std::pair<int, std::string>> cheapestPath(
    const std::vector<std::string>& grid) {
    const int rows = grid.size(), cols = grid[0].size();
    std::vector<std::vector<int>> m(rows, std::vector<int>(cols, INF));
    for (int r = 0; r < rows; ++r)
        for (int c = 0; c < cols; ++c) {
            if (grid[r][c] == WALL) continue;  // no way in
            const int cost = grid[r][c] - '0';
            if (r == 0 && c == 0) {
                m[r][c] = cost;
            } else {
                const int best = std::min(r > 0 ? m[r - 1][c] : INF, c > 0 ? m[r][c - 1] : INF);
                if (best < INF) m[r][c] = cost + best;  // this cell, plus the cheaper way in
            }
        }
    if (m[rows - 1][cols - 1] >= INF) return std::nullopt;
    std::string back;
    int r = rows - 1, c = cols - 1;
    while (r > 0 || c > 0) {  // walk back to the cheaper neighbour; a tie goes up
        if (r > 0 && (c == 0 || m[r - 1][c] <= m[r][c - 1])) {
            --r;
            back += 'D';
        } else {
            --c;
            back += 'R';
        }
    }
    std::reverse(back.begin(), back.end());
    return std::make_pair(m[rows - 1][cols - 1], back);
}
