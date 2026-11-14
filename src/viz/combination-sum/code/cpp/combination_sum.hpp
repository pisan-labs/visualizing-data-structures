#pragma once
#include <algorithm>
#include <vector>

namespace detail {
inline void search(const std::vector<int>& c, bool reuse, std::size_t start, int left,
                   std::vector<int>& chosen, std::vector<std::vector<int>>& out) {
    if (left == 0) {
        out.push_back(chosen);
        return;
    }
    for (std::size_t i = start; i < c.size(); ++i) {
        if (!reuse && i > start && c[i] == c[i - 1]) continue;  // the same value again here
        if (c[i] > left) break;  // c is sorted, so every later candidate is bigger too
        chosen.push_back(c[i]);
        search(c, reuse, reuse ? i : i + 1, left - c[i], chosen, out);
        chosen.pop_back();
    }
}
}  // namespace detail

// Every combination of candidates that adds up to target, each a sorted list. reuse: a
// candidate may be used again and again; otherwise each once (a value given twice may be used
// twice).
inline std::vector<std::vector<int>> combinationSum(std::vector<int> c, int target, bool reuse) {
    std::sort(c.begin(), c.end());
    if (reuse) c.erase(std::unique(c.begin(), c.end()), c.end());
    std::vector<std::vector<int>> out;
    std::vector<int> chosen;
    detail::search(c, reuse, 0, target, chosen, out);
    return out;
}
