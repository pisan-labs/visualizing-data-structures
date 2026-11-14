#pragma once
#include <functional>
#include <queue>
#include <tuple>
#include <vector>

// Merge sorted lists into one sorted list. O(n log k) for n values in k lists.
inline std::vector<int> mergeLists(const std::vector<std::vector<int>>& lists) {
    // One entry per list: (head value, list number, position). Ties go in list order.
    using Entry = std::tuple<int, int, int>;
    std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> heap;
    for (int j = 0; j < static_cast<int>(lists.size()); ++j)
        if (!lists[j].empty()) heap.emplace(lists[j][0], j, 0);
    std::vector<int> out;
    while (!heap.empty()) {
        auto [x, j, i] = heap.top();  // the smallest value left anywhere
        heap.pop();
        out.push_back(x);
        if (i + 1 < static_cast<int>(lists[j].size())) heap.emplace(lists[j][i + 1], j, i + 1);
    }
    return out;
}
