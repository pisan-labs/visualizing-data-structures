#include <algorithm>
#include <climits>
#include <numeric>
#include <utility>
#include <vector>

// The most activities that do not overlap, by earliest finish first. Each activity is a
// (start, finish) pair, half-open. Returns their numbers (from 1) in the order they are chosen.
std::vector<int> select_activities(const std::vector<std::pair<int, int>>& acts) {
  std::vector<int> order(acts.size());
  std::iota(order.begin(), order.end(), 0);
  std::stable_sort(order.begin(), order.end(),
                   [&](int a, int b) { return acts[a].second < acts[b].second; });
  std::vector<int> chosen;
  int last = INT_MIN;
  for (int k : order) {
    if (acts[k].first >= last) {
      chosen.push_back(k + 1);
      last = acts[k].second;
    }
  }
  return chosen;
}
