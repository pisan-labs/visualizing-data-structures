#pragma once
#include <string>
#include <utility>
#include <vector>

namespace detail {
// Both sides of the last tile first, then the tile.
inline void take(const std::vector<std::vector<int>>& last, int a, int b, std::vector<int>& order) {
    if (a > b) return;
    const int k = last[a][b];
    take(last, a, k - 1, order);
    take(last, k + 1, b, order);
    order.push_back(k);
}

inline std::string brackets(const std::vector<int>& piles, const std::vector<std::vector<int>>& split,
                            int a, int b) {
    if (a == b) return std::to_string(piles[a]);
    const int k = split[a][b];
    return "(" + brackets(piles, split, a, k) + " " + brackets(piles, split, k + 1, b) + ")";
}
}  // namespace detail

// Best total for taking every tile, each scoring itself times its two current neighbours (the
// ends count as 1), and the order to take them, by position from 1.
inline std::pair<long long, std::vector<int>> bestRemoval(const std::vector<int>& tiles) {
    const int n = tiles.size();
    std::vector<long long> v(n + 2, 1);  // v[1..n] are the tiles; v[0] and v[n + 1] the posts
    for (int i = 0; i < n; ++i) v[i + 1] = tiles[i];
    std::vector<std::vector<long long>> B(n + 2, std::vector<long long>(n + 2, 0));
    std::vector<std::vector<int>> last(n + 2, std::vector<int>(n + 2, 0));
    for (int len = 1; len <= n; ++len)  // shorter stretches first
        for (int a = 1; a + len - 1 <= n; ++a) {
            const int b = a + len - 1;
            for (int k = a; k <= b; ++k) {  // k goes last, between a - 1 and b + 1
                const long long score = B[a][k - 1] + B[k + 1][b] + v[a - 1] * v[k] * v[b + 1];
                if (k == a || score > B[a][b]) {
                    B[a][b] = score;
                    last[a][b] = k;
                }
            }
        }
    std::vector<int> order;
    detail::take(last, 1, n, order);
    return {B[1][n], order};
}

// Least total cost to merge neighbouring piles into one, a merge costing the two sizes added,
// and the merges as brackets of pile sizes.
inline std::pair<long long, std::string> cheapestMerge(const std::vector<int>& piles) {
    const int n = piles.size();
    std::vector<long long> pre(n + 1, 0);  // pre[b + 1] - pre[a] is the size of piles a..b
    for (int i = 0; i < n; ++i) pre[i + 1] = pre[i] + piles[i];
    std::vector<std::vector<long long>> M(n, std::vector<long long>(n, 0));
    std::vector<std::vector<int>> split(n, std::vector<int>(n, 0));
    for (int len = 2; len <= n; ++len)
        for (int a = 0; a + len - 1 < n; ++a) {
            const int b = a + len - 1;
            for (int k = a; k < b; ++k) {  // the last merge joins a..k with k + 1..b
                const long long cost = M[a][k] + M[k + 1][b] + pre[b + 1] - pre[a];
                if (k == a || cost < M[a][b]) {
                    M[a][b] = cost;
                    split[a][b] = k;
                }
            }
        }
    return {M[0][n - 1], detail::brackets(piles, split, 0, n - 1)};
}
