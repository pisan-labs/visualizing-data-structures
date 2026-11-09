#pragma once
#include <algorithm>
#include <optional>
#include <utility>
#include <vector>

// Indices (lo, hi) with a[lo] + a[hi] == target in sorted a, or nothing.
inline std::optional<std::pair<int, int>> pairSum(const std::vector<int>& a, int target) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1;
    while (lo < hi) {
        int sum = a[lo] + a[hi];
        if (sum == target) return std::make_pair(lo, hi);
        if (sum < target) ++lo;  // a[lo] is too small for every partner left
        else --hi;               // a[hi] is too big for every partner left
    }
    return std::nullopt;
}

// The most water two walls hold: min(a[i], a[j]) * (j - i).
inline int maxWater(const std::vector<int>& a) {
    int lo = 0, hi = static_cast<int>(a.size()) - 1, best = 0;
    while (lo < hi) {
        best = std::max(best, std::min(a[lo], a[hi]) * (hi - lo));
        if (a[lo] < a[hi]) ++lo;
        else --hi;
    }
    return best;
}

// Keep one copy of each value of sorted a in a[0..k-1]; return k.
inline int removeDuplicates(std::vector<int>& a) {
    if (a.empty()) return 0;
    int slow = 0;
    for (int fast = 1; fast < static_cast<int>(a.size()); ++fast) {
        if (a[fast] != a[slow]) a[++slow] = a[fast];
    }
    return slow + 1;
}

inline void reverseInPlace(std::vector<int>& a) {
    for (int lo = 0, hi = static_cast<int>(a.size()) - 1; lo < hi; ++lo, --hi)
        std::swap(a[lo], a[hi]);
}
