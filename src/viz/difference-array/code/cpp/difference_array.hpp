#pragma once
#include <vector>

struct Update {
    int l, r, x;
};

// A copy of a with x added to a[l..r] for every update. O(n + q) for q updates.
inline std::vector<int> applyUpdates(std::vector<int> a, const std::vector<Update>& updates) {
    std::vector<int> d(a.size() + 1, 0);  // one spare, so r + 1 = n needs no special case
    for (const Update& u : updates) {
        d[u.l] += u.x;      // from l on, everything changes by x
        d[u.r + 1] -= u.x;  // and from r + 1 on, it stops
    }
    int run = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        run += d[i];  // the total change at i
        a[i] += run;
    }
    return a;
}
