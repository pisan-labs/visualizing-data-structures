#pragma once
#include <functional>
#include <queue>
#include <vector>

// The k largest values of a, smallest first. O(n log k) time, O(k) extra space.
inline std::vector<int> topK(const std::vector<int>& a, int k) {
    // A min-heap of the best k so far: top() is the one to beat.
    std::priority_queue<int, std::vector<int>, std::greater<int>> heap;
    for (int x : a) {
        if (static_cast<int>(heap.size()) < k) {
            heap.push(x);
        } else if (x > heap.top()) {
            heap.pop();
            heap.push(x);
        }
    }
    std::vector<int> out;
    for (; !heap.empty(); heap.pop()) out.push_back(heap.top());
    return out;
}

// The k-th largest value of a (k = 1 is the largest): the smallest of the k largest.
inline int kthLargest(const std::vector<int>& a, int k) { return topK(a, k).front(); }
