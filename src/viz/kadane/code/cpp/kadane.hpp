#pragma once
#include <climits>
#include <vector>

struct Best {
    int sum, lo, hi;
};

// The largest sum of a subarray of a, and its ends. One pass, O(n). A subarray has at least
// one value, unless allowEmpty: then the empty one, {0, 0, -1}, counts too. Of two with the
// same sum, the one that starts first wins.
inline Best maxSubarray(const std::vector<int>& a, bool allowEmpty = false) {
    Best best = allowEmpty ? Best{0, 0, -1} : Best{INT_MIN, 0, 0};
    int run = 0, start = 0;  // run: the best sum of a subarray ending here
    for (int j = 0; j < static_cast<int>(a.size()); ++j) {
        if (run < 0) {  // the run so far only drags a[j] down: restart here
            run = 0;
            start = j;
        }
        run += a[j];
        if (run > best.sum) best = {run, start, j};
    }
    return best;
}
