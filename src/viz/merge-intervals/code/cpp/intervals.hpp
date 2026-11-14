#pragma once
#include <algorithm>
#include <cstddef>
#include <utility>
#include <vector>

using Interval = std::pair<int, int>;  // {start, end}

// Merge overlapping intervals; touching ends merge too. O(n log n).
std::vector<Interval> merge(std::vector<Interval> intervals) {
    std::stable_sort(intervals.begin(), intervals.end(),
                     [](const Interval& a, const Interval& b) { return a.first < b.first; });
    std::vector<Interval> out;
    for (const auto& [start, end] : intervals) {
        if (!out.empty() && start <= out.back().second)  // reaches the last one out
            out.back().second = std::max(out.back().second, end);
        else
            out.push_back({start, end});  // starts after it: a new one
    }
    return out;
}

// Insert x into a sorted list of intervals that do not overlap. O(n).
std::vector<Interval> insert(const std::vector<Interval>& intervals, Interval x) {
    std::vector<Interval> out;
    std::size_t i = 0, n = intervals.size();
    while (i < n && intervals[i].second < x.first) out.push_back(intervals[i++]);  // before x
    while (i < n && intervals[i].first <= x.second) {  // overlaps x: absorb it
        x.first = std::min(x.first, intervals[i].first);
        x.second = std::max(x.second, intervals[i].second);
        i++;
    }
    out.push_back(x);
    while (i < n) out.push_back(intervals[i++]);  // the rest start after x ends
    return out;
}

// What two sorted lists of non-overlapping intervals have in common. O(m + n).
std::vector<Interval> intersect(const std::vector<Interval>& a, const std::vector<Interval>& b) {
    std::vector<Interval> out;
    std::size_t i = 0, j = 0;
    while (i < a.size() && j < b.size()) {
        int lo = std::max(a[i].first, b[j].first);
        int hi = std::min(a[i].second, b[j].second);
        if (lo <= hi) out.push_back({lo, hi});
        if (a[i].second < b[j].second)  // the one that ends first can meet nothing more
            i++;
        else
            j++;
    }
    return out;
}
