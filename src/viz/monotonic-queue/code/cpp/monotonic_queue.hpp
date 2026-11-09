#pragma once
#include <deque>
#include <vector>

// The maximum of every window of k consecutive values.
inline std::vector<int> windowMax(const std::vector<int>& a, int k) {
    std::vector<int> out;
    std::deque<int> d;  // indices; their values decrease from front to back
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (!d.empty() && d.front() == i - k) d.pop_front();     // it left the window
        while (!d.empty() && a[d.back()] <= a[i]) d.pop_back();  // it can never win again
        d.push_back(i);
        if (i >= k - 1) out.push_back(a[d.front()]);
    }
    return out;
}

// The minimum of every window of k consecutive values.
inline std::vector<int> windowMin(const std::vector<int>& a, int k) {
    std::vector<int> out;
    std::deque<int> d;  // indices; their values increase from front to back
    for (int i = 0; i < static_cast<int>(a.size()); ++i) {
        if (!d.empty() && d.front() == i - k) d.pop_front();
        while (!d.empty() && a[d.back()] >= a[i]) d.pop_back();
        d.push_back(i);
        if (i >= k - 1) out.push_back(a[d.front()]);
    }
    return out;
}
