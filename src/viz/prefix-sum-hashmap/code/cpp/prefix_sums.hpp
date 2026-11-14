#pragma once
#include <unordered_map>
#include <utility>
#include <vector>

// How many subarrays (non-empty, contiguous) of a sum to k. One pass, O(n).
inline int countSumK(const std::vector<int>& a, int k) {
    std::unordered_map<int, int> seen{{0, 1}};  // running sum -> times it has appeared
    int total = 0, count = 0;
    for (int x : a) {
        total += x;
        auto it = seen.find(total - k);  // each earlier total - k starts one that ends here
        if (it != seen.end()) count += it->second;
        ++seen[total];
    }
    return count;
}

// {length, start} of the longest subarray with sum k, or {0, -1} if there is none.
inline std::pair<int, int> longestSumK(const std::vector<int>& a, int k) {
    std::unordered_map<int, int> first{{0, 0}};  // running sum -> values it took to appear
    int total = 0, best = 0, start = -1;
    for (int j = 1; j <= static_cast<int>(a.size()); ++j) {
        total += a[j - 1];
        auto it = first.find(total - k);
        if (it != first.end() && j - it->second > best) {  // a[i..j-1] sums to k
            best = j - it->second;
            start = it->second;
        }
        first.emplace(total, j);  // does nothing if total is there: keep the first
    }
    return {best, start};
}
