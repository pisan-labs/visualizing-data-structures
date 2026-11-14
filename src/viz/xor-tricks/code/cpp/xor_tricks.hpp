#pragma once
#include <algorithm>
#include <cstddef>
#include <utility>
#include <vector>

// The one value without a pair: pairs cancel, since x ^ x = 0. O(1) extra space.
int single(const std::vector<int>& nums) {
    int acc = 0;
    for (int x : nums) acc ^= x;
    return acc;
}

// The number missing from 0..n, given n different values from 0..n.
int missing(const std::vector<int>& nums) {
    int acc = static_cast<int>(nums.size());  // n is the one number that is not an index
    for (std::size_t i = 0; i < nums.size(); i++) acc ^= static_cast<int>(i) ^ nums[i];
    return acc;
}

// The two values without a pair, smaller first.
std::pair<int, int> twoSingles(const std::vector<int>& nums) {
    int x = 0;
    for (int v : nums) x ^= v;  // ends as a ^ b, not 0 since a != b
    int low = x & -x;           // the lowest bit where a and b differ
    int a = 0, b = 0;
    for (int v : nums) {
        if (v & low)
            a ^= v;
        else
            b ^= v;
    }
    return {std::min(a, b), std::max(a, b)};
}

// Swap values[i] and values[j] without a temporary.
void xorSwap(std::vector<int>& values, std::size_t i, std::size_t j) {
    if (i == j) return;  // values[i] ^= values[i] would make it 0
    values[i] ^= values[j];
    values[j] ^= values[i];
    values[i] ^= values[j];
}
