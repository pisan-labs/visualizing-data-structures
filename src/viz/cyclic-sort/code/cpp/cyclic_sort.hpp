#pragma once
#include <utility>
#include <vector>

// a holds n numbers, each from 1 to n. Puts each value v at its home, a[v - 1], in place. Each
// swap sends one value home for good, so at most n - 1 swaps.
inline void cyclicSort(std::vector<int>& a) {
    std::size_t i = 0;
    while (i < a.size()) {
        std::size_t j = a[i] - 1;  // where a[i] belongs
        if (a[i] != a[j]) {
            std::swap(a[i], a[j]);  // a[j] is home; look at the new a[i]
        } else {
            ++i;  // home already, or a repeat whose home is taken
        }
    }
}

// Sorts a, then returns {missing, repeated}: the numbers from 1 to n missing, and the repeats.
inline std::pair<std::vector<int>, std::vector<int>> missingAndRepeated(std::vector<int>& a) {
    cyclicSort(a);
    std::vector<int> missing, repeated;
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (a[i] != static_cast<int>(i) + 1) {  // slot i should hold i + 1
            missing.push_back(static_cast<int>(i) + 1);
            repeated.push_back(a[i]);
        }
    }
    return {missing, repeated};
}
