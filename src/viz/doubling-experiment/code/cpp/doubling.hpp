// A doubling experiment: count an algorithm's basic steps at n, 2n, 4n, ... Each algorithm
// returns how many basic steps it took. doubling() runs one at sizes that double and estimates
// b in T(n) ~ a * n^b from each ratio, since T(2n) / T(n) ~ 2^b.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <optional>
#include <utility>
#include <vector>

// Bigger than every input value, so searches never find it.
constexpr int MISSING = 1'000'000;

long long linearSearch(std::vector<int>& a) {
  long long steps = 0;
  for (int v : a) {
    steps++;  // one comparison
    if (v == MISSING) break;
  }
  return steps;
}

// a is sorted.
long long binarySearch(std::vector<int>& a) {
  long long steps = 0;
  int lo = 0, hi = static_cast<int>(a.size()) - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    steps++;  // one probe
    if (a[mid] == MISSING) break;
    if (a[mid] < MISSING) lo = mid + 1;
    else hi = mid - 1;
  }
  return steps;
}

// Put a's values in a hash set (linear probing): count slots looked at.
long long distinctValues(std::vector<int>& a) {
  int bits = 1;
  while ((std::size_t{1} << bits) < 2 * a.size()) bits++;
  std::size_t size = std::size_t{1} << bits;
  std::vector<bool> used(size, false);
  std::vector<int> keys(size);
  long long steps = 0;
  for (int x : a) {
    std::size_t i = (static_cast<std::uint32_t>(x) * 2654435761u) >> (32 - bits);
    while (true) {
      steps++;  // one slot looked at
      if (!used[i]) {
        used[i] = true;
        keys[i] = x;
        break;
      }
      if (keys[i] == x) break;
      i = (i + 1) % size;
    }
  }
  return steps;
}

// Sorts a[lo..hi) and returns the comparisons it made.
long long mergeSort(std::vector<int>& a, std::vector<int>& aux, int lo, int hi) {
  if (hi - lo < 2) return 0;
  int mid = (lo + hi) / 2;
  long long steps = mergeSort(a, aux, lo, mid) + mergeSort(a, aux, mid, hi);
  std::copy(a.begin() + lo, a.begin() + hi, aux.begin() + lo);
  int i = lo, j = mid, k = lo;
  while (i < mid && j < hi) {
    steps++;  // one comparison
    a[k++] = aux[i] <= aux[j] ? aux[i++] : aux[j++];
  }
  while (i < mid) a[k++] = aux[i++];
  while (j < hi) a[k++] = aux[j++];
  return steps;
}

long long mergeSort(std::vector<int>& a) {
  std::vector<int> aux(a.size());
  return mergeSort(a, aux, 0, static_cast<int>(a.size()));
}

long long insertionSort(std::vector<int>& a) {
  long long steps = 0;
  for (std::size_t j = 1; j < a.size(); j++) {
    int key = a[j];
    long long i = static_cast<long long>(j) - 1;
    while (i >= 0) {
      steps++;  // one comparison
      if (a[i] <= key) break;
      a[i + 1] = a[i];
      i--;
    }
    a[i + 1] = key;
  }
  return steps;
}

// Counts the triples that add up to 0. Returns {triples, steps}.
std::pair<long long, long long> threeSum(const std::vector<int>& a) {
  std::size_t n = a.size();
  long long triples = 0, steps = 0;
  for (std::size_t i = 0; i < n; i++) {
    for (std::size_t j = i + 1; j < n; j++) {
      for (std::size_t k = j + 1; k < n; k++) {
        steps++;  // one triple checked
        if (a[i] + a[j] + a[k] == 0) triples++;
      }
    }
  }
  return {triples, steps};
}

using Algorithm = std::function<long long(std::vector<int>&)>;

// One size of the experiment; b is empty for the first size.
struct Row {
  int n;
  long long t;
  std::optional<double> b;
};

std::vector<Row> doubling(const Algorithm& algorithm,
                          const std::function<std::vector<int>(int)>& makeInput, int n,
                          int largest) {
  std::vector<Row> rows;
  long long before = 0;
  for (; n <= largest; n *= 2) {
    std::vector<int> a = makeInput(n);
    long long t = algorithm(a);
    std::optional<double> b;
    if (before > 0) b = std::log2(static_cast<double>(t) / before);
    rows.push_back({n, t, b});
    before = t;
  }
  return rows;
}
