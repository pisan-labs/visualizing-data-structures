#pragma once
#include <algorithm>
#include <utility>
#include <vector>

// Timsort, the core of it: find natural runs, grow short ones to kMinrun with binary
// insertion sort, and merge them off a stack that keeps |Z| > |Y| + |X| and |Y| > |X|
// (X on top). std::stable_sort is a plain merge sort; this one uses the order already there.

namespace timsort_detail {

constexpr int kMinrun = 4;  // real Timsort picks 32 to 64 from n

struct Run {
  int base;
  int len;
};

// End (exclusive) of the natural run at a[lo]; a strictly falling run is reversed.
inline int run_end(std::vector<int>& a, int lo) {
  int n = static_cast<int>(a.size());
  int end = lo + 1;
  if (end == n) return end;
  if (a[end] < a[lo]) {
    while (end + 1 < n && a[end + 1] < a[end]) end++;
    std::reverse(a.begin() + lo, a.begin() + end + 1);
  } else {
    while (end + 1 < n && a[end + 1] >= a[end]) end++;
  }
  return end + 1;
}

inline void binary_insertion_sort(std::vector<int>& a, int lo, int end) {
  for (int i = lo + 1; i < end; i++) {
    int key = a[i];
    int left = lo;
    int right = i;
    while (left < right) {
      int mid = (left + right) / 2;
      if (a[mid] <= key) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    std::move_backward(a.begin() + left, a.begin() + i, a.begin() + i + 1);
    a[left] = key;
  }
}

// How many of a[base..base+len-1] are <= key: jumps of 1, 3, 7, ..., then binary search.
inline int gallop_right(int key, const std::vector<int>& a, int base, int len) {
  if (a[base] > key) return 0;
  int last = 0;
  int ofs = 1;
  while (ofs < len && a[base + ofs] <= key) {
    last = ofs;
    ofs = 2 * ofs + 1;
  }
  int lo = last + 1;
  int hi = std::min(ofs, len);
  while (lo < hi) {
    int mid = (lo + hi) / 2;
    if (a[base + mid] <= key) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// How many of a[base..base+len-1] are < key, galloping from the right.
inline int gallop_left(int key, const std::vector<int>& a, int base, int len) {
  if (a[base + len - 1] < key) return len;
  int last = len - 1;
  int ofs = 1;
  while (ofs < len && a[base + len - 1 - ofs] >= key) {
    last = len - 1 - ofs;
    ofs = 2 * ofs + 1;
  }
  int lo = std::max(len - 1 - ofs, -1) + 1;
  int hi = last;
  while (lo < hi) {
    int mid = (lo + hi) / 2;
    if (a[base + mid] < key) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

inline void merge_at(std::vector<int>& a, std::vector<Run>& stack, int i) {
  Run x = stack[i];
  Run y = stack[i + 1];
  stack[i] = {x.base, x.len + y.len};
  stack.erase(stack.begin() + i + 1);
  int skip = gallop_right(a[y.base], a, x.base, x.len);  // already in place
  int base_a = x.base + skip;
  int len_a = x.len - skip;
  if (len_a == 0) return;
  int len_b = gallop_left(a[base_a + len_a - 1], a, y.base, y.len);
  std::vector<int> tmp(a.begin() + base_a, a.begin() + base_a + len_a);
  int t = 0;
  int j = y.base;
  int k = base_a;
  while (t < len_a && j < y.base + len_b) a[k++] = tmp[t] <= a[j] ? tmp[t++] : a[j++];
  while (t < len_a) a[k++] = tmp[t++];
}

inline void collapse(std::vector<int>& a, std::vector<Run>& stack) {
  while (stack.size() > 1) {
    int i = static_cast<int>(stack.size()) - 2;
    bool z_bad = i > 0 && stack[i - 1].len <= stack[i].len + stack[i + 1].len;
    bool w_bad = i > 1 && stack[i - 2].len <= stack[i - 1].len + stack[i].len;
    if (z_bad || w_bad) {
      if (stack[i - 1].len < stack[i + 1].len) i--;
    } else if (stack[i].len > stack[i + 1].len) {
      return;
    }
    merge_at(a, stack, i);
  }
}

}  // namespace timsort_detail

inline void timsort(std::vector<int>& a) {
  using namespace timsort_detail;
  int n = static_cast<int>(a.size());
  std::vector<Run> stack;
  int lo = 0;
  while (lo < n) {
    int end = run_end(a, lo);
    if (end - lo < kMinrun && end < n) {
      end = std::min(lo + kMinrun, n);
      binary_insertion_sort(a, lo, end);
    }
    stack.push_back({lo, end - lo});
    lo = end;
    collapse(a, stack);
  }
  while (stack.size() > 1) {
    int i = static_cast<int>(stack.size()) - 2;
    if (i > 0 && stack[i - 1].len < stack[i + 1].len) i--;
    merge_at(a, stack, i);
  }
}
