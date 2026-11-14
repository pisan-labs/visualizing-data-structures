#pragma once
#include <bitset>
#include <climits>
#include <vector>

// cost[w][t]: what worker w charges for task t, n x n.
// Returns {total, task of worker 0, task of worker 1, ...}.
inline std::vector<int> cheapest(const std::vector<std::vector<int>>& cost) {
    const int n = static_cast<int>(cost.size());
    const int full = (1 << n) - 1;
    std::vector<int> f(1 << n, INT_MAX);  // f[mask]: cheapest way to give mask's tasks out
    std::vector<int> last(1 << n, 0);     // the task the last of those workers takes
    f[0] = 0;
    for (int mask = 1; mask <= full; mask++) {  // mask minus a task is smaller: already done
        const int k = static_cast<int>(std::bitset<32>(mask).count());  // workers 0..k-1
        for (int t = 0; t < n; t++) {
            if (!(mask >> t & 1)) continue;
            const int c = f[mask ^ (1 << t)] + cost[k - 1][t];  // worker k-1 takes t last
            if (c < f[mask]) {
                f[mask] = c;
                last[mask] = t;
            }
        }
    }
    std::vector<int> out(n + 1);
    out[0] = f[full];
    for (int w = n - 1, mask = full; w >= 0; w--) {  // walk back from the full mask
        out[w + 1] = last[mask];
        mask ^= 1 << last[mask];
    }
    return out;
}
