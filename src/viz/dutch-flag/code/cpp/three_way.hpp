#pragma once
#include <utility>
#include <vector>

// Rearranges a in place: values below p, then values equal to p, then values above p. One
// pass, O(1) extra space. Returns {low, high}: a[low..high] holds the values equal to p (none
// when low > high).
inline std::pair<int, int> threeWayPartition(std::vector<int>& a, int p) {
    int low = 0, mid = 0, high = static_cast<int>(a.size()) - 1;
    while (mid <= high) {  // a[mid..high] is still unknown
        if (a[mid] < p) {
            std::swap(a[low], a[mid]);  // a[low] was a p (or is a[mid] itself)
            ++low;
            ++mid;
        } else if (a[mid] > p) {
            std::swap(a[mid], a[high]);  // the value that comes to mid is unknown
            --high;
        } else {
            ++mid;
        }
    }
    return {low, high};
}
