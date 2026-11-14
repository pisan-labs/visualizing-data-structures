#pragma once
#include <vector>

using Matrix = std::vector<std::vector<int>>;

// The values of a matrix in spiral order: clockwise from the top left, ring by ring. Four
// bounds mark the part not visited yet; O(1) extra space besides the answer.
inline std::vector<int> spiralOrder(const Matrix& m) {
    std::vector<int> out;
    int top = 0, bottom = static_cast<int>(m.size()) - 1;
    int left = 0, right = static_cast<int>(m[0].size()) - 1;
    while (top <= bottom && left <= right) {
        for (int c = left; c <= right; ++c) out.push_back(m[top][c]);
        ++top;
        for (int r = top; r <= bottom; ++r) out.push_back(m[r][right]);
        --right;
        if (top <= bottom) {  // a row is left for the bottom side
            for (int c = right; c >= left; --c) out.push_back(m[bottom][c]);
            --bottom;
        }
        if (left <= right) {  // a column is left for the left side
            for (int r = bottom; r >= top; --r) out.push_back(m[r][left]);
            ++left;
        }
    }
    return out;
}

// Turns a square matrix a quarter turn clockwise, in place, one ring at a time.
inline void rotate(Matrix& m) {
    int n = static_cast<int>(m.size());
    for (int layer = 0; layer < n / 2; ++layer) {
        int first = layer, last = n - 1 - layer;
        for (int k = 0; k < last - first; ++k) {
            int tmp = m[first][first + k];
            m[first][first + k] = m[last - k][first];  // left to top
            m[last - k][first] = m[last][last - k];    // bottom to left
            m[last][last - k] = m[first + k][last];    // right to bottom
            m[first + k][last] = tmp;                  // top to right
        }
    }
}
