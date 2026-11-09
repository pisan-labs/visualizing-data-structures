#pragma once
#include <algorithm>
#include <unordered_map>
#include <utility>
#include <vector>

// The largest sum of k values in a row, and where that window starts.
inline std::pair<int, int> maxSum(const std::vector<int>& a, int k) {
    int sum = 0;
    for (int i = 0; i < k; ++i) sum += a[i];
    int best = sum, at = 0;
    for (int r = k; r < static_cast<int>(a.size()); ++r) {
        sum += a[r] - a[r - k];  // a[r] enters, a[r - k] leaves
        if (sum > best) {
            best = sum;
            at = r - k + 1;
        }
    }
    return {best, at};
}

// Length of the shortest window with sum >= target (values >= 0), or 0.
inline int shortestAtLeast(const std::vector<int>& a, int target) {
    int n = static_cast<int>(a.size());
    int best = n + 1, left = 0, sum = 0;
    for (int right = 0; right < n; ++right) {
        sum += a[right];
        while (sum >= target) {
            best = std::min(best, right - left + 1);
            sum -= a[left++];
        }
    }
    return best > n ? 0 : best;
}

// Length and start of the longest window with no repeated value.
inline std::pair<int, int> longestDistinct(const std::vector<int>& a) {
    std::unordered_map<int, int> count;
    int best = 0, at = 0, left = 0;
    for (int right = 0; right < static_cast<int>(a.size()); ++right) {
        ++count[a[right]];
        while (count[a[right]] > 1) --count[a[left++]];
        if (right - left + 1 > best) {
            best = right - left + 1;
            at = left;
        }
    }
    return {best, at};
}
