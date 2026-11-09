#pragma once
#include <algorithm>
#include <stack>
#include <vector>

// For each value, the first bigger value to its right, or -1.
inline std::vector<int> nextGreater(const std::vector<int>& a) {
    std::vector<int> ans(a.size(), -1);
    std::stack<int> s;  // indices; their values decrease from bottom to top
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        while (!s.empty() && a[s.top()] < a[i]) {
            ans[s.top()] = a[i];
            s.pop();
        }
        s.push(i);
    }
    return ans;
}

// For each value, the nearest smaller value to its left, or -1.
inline std::vector<int> previousSmaller(const std::vector<int>& a) {
    std::vector<int> ans(a.size(), -1);
    std::stack<int> s;  // indices; their values increase from bottom to top
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        while (!s.empty() && a[s.top()] >= a[i]) s.pop();
        if (!s.empty()) ans[i] = a[s.top()];
        s.push(i);
    }
    return ans;
}

// The largest rectangle under bars of heights h, each 1 wide.
inline int largestRectangle(const std::vector<int>& h) {
    int n = static_cast<int>(h.size()), best = 0;
    std::stack<int> s;  // indices; their heights increase from bottom to top
    for (int i = 0; i <= n; ++i) {
        int height = i < n ? h[i] : 0;
        while (!s.empty() && h[s.top()] >= height) {
            int j = s.top();
            s.pop();
            int left = s.empty() ? 0 : s.top() + 1;
            best = std::max(best, h[j] * (i - left));
        }
        s.push(i);
    }
    return best;
}
