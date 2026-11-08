#pragma once
#include <algorithm>
#include <climits>
#include <vector>

// d rows of w counters. Row i uses h_i(x) = ((A[i]*x + B[i]) mod P) mod w.
class CountMinSketch {
 public:
  CountMinSketch(int d, int w) : d_(d), w_(w), c_(d, std::vector<int>(w, 0)) {}

  int rows() const { return d_; }

  int column(int i, int x) const {
    static const int A[] = {71, 113, 157, 211, 263};
    static const int B[] = {5, 17, 29, 43, 61};
    const int P = 1009;  // a prime larger than every item
    return (A[i] * x + B[i]) % P % w_;
  }

  void add(int x) {
    for (int i = 0; i < d_; i++) c_[i][column(i, x)]++;
  }

  // Never below the true count; above it when other items share every counter.
  int estimate(int x) const {
    int best = INT_MAX;
    for (int i = 0; i < d_; i++) best = std::min(best, c_[i][column(i, x)]);
    return best;
  }

  // The candidates whose estimate is at least percent% of the n items added.
  std::vector<int> heavyHitters(const std::vector<int>& candidates, int n, int percent) const {
    std::vector<int> hits;
    for (int x : candidates) {
      if (estimate(x) * 100 >= percent * n) hits.push_back(x);
    }
    std::sort(hits.begin(), hits.end(), [this](int a, int b) {
      int ea = estimate(a), eb = estimate(b);
      return ea != eb ? ea > eb : a < b;
    });
    return hits;
  }

 private:
  int d_;
  int w_;
  std::vector<std::vector<int>> c_;
};
