#pragma once
#include <algorithm>
#include <array>
#include <cstddef>
#include <queue>
#include <set>
#include <utility>
#include <vector>

// The most intervals [start, end) open at once. O(n log n).
int mostOpen(const std::vector<std::pair<int, int>>& intervals) {
    std::vector<std::pair<int, int>> events;  // {time, +1 or -1}
    for (const auto& [s, e] : intervals) {
        events.push_back({s, +1});
        events.push_back({e, -1});
    }
    std::sort(events.begin(), events.end());  // at equal times -1 first: ends before starts
    int open = 0, best = 0;
    for (const auto& [t, change] : events) {
        open += change;
        best = std::max(best, open);
    }
    return best;
}

// Key points {x, height} of the outline of buildings {left, right, height}. O(n log n).
std::vector<std::pair<int, int>> skyline(std::vector<std::array<int, 3>> buildings) {
    std::set<int> xs;
    for (const auto& b : buildings) xs.insert({b[0], b[1]});
    std::sort(buildings.begin(), buildings.end());  // by left edge
    std::priority_queue<std::pair<int, int>> heap;  // {height, right}: the tallest on top
    std::vector<std::pair<int, int>> out;
    std::size_t i = 0;
    int prev = 0;
    for (int x : xs) {
        for (; i < buildings.size() && buildings[i][0] == x; i++)  // push what starts here
            heap.push({buildings[i][2], buildings[i][1]});
        while (!heap.empty() && heap.top().second <= x) heap.pop();  // lazy removal
        int height = heap.empty() ? 0 : heap.top().first;
        if (height != prev) out.push_back({x, height});
        prev = height;
    }
    return out;
}
