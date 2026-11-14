#pragma once
#include <functional>
#include <queue>
#include <vector>

// The median of the values added so far: add is O(log n), median is O(1).
class RunningMedian {
public:
    void add(int x) {
        if (low.empty() || x <= low.top())
            low.push(x);
        else
            high.push(x);
        // Rebalance, so low holds as many as high or one more.
        if (low.size() > high.size() + 1) {
            high.push(low.top());
            low.pop();
        } else if (high.size() > low.size()) {
            low.push(high.top());
            high.pop();
        }
    }

    // The middle value, or the mean of the two middle values for an even count.
    double median() const {
        if (low.size() > high.size()) return low.top();
        return (low.top() + high.top()) / 2.0;
    }

    // The middle value, or the lower of the two middle values.
    int lowerMedian() const { return low.top(); }

private:
    std::priority_queue<int> low;                                       // smaller half, max on top
    std::priority_queue<int, std::vector<int>, std::greater<int>> high;  // larger half, min on top
};
