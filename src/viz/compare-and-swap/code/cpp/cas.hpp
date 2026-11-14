// A counter without a lock: read, compute, compare-and-swap, and retry on failure.
// std::atomic<int>::compare_exchange_strong is the hardware's compare-and-swap (on failure it
// also loads the current value into its first argument). increment is the loop the page steps
// through.
//
// Steps runs the page's program one step at a time instead (with the cas, or with a plain
// store), so a caller can pick the interleaving.
#pragma once
#include <atomic>
#include <thread>
#include <vector>

// Add 1 to n. Returns how many times the swap failed and had to be retried.
inline int increment(std::atomic<int>& n) {
  int retries = 0;
  while (true) {
    int r = n.load();
    int s = r + 1;
    if (n.compare_exchange_strong(r, s)) return retries;
    retries++;  // another thread changed n since we read it
  }
}

// k real threads each add 1 to n `times` times. Returns n.
inline int run_threads(int k, int times) {
  std::atomic<int> n{0};
  std::vector<std::thread> threads;
  for (int i = 0; i < k; i++)
    threads.emplace_back([&n, times] {
      for (int j = 0; j < times; j++) increment(n);
    });
  for (auto& th : threads) th.join();
  return n.load();
}

// Thread t: r = n, s = r + 1, then ok = cas(n, r, s) and a retry if it failed (or n = s).
class Steps {
 public:
  Steps(int k, bool cas) : cas(cas), pc(k), r(k), s(k), ok(k), retries(k) {}

  int n = 0;
  bool cas;
  std::vector<int> pc, r, s, ok, retries;

  // Runs thread t's next step. False if it is done.
  bool step(int t) {
    int k = pc[t];
    if (k == (cas ? 4 : 3)) return false;
    if (k == 0) {
      r[t] = n;
    } else if (k == 1) {
      s[t] = r[t] + 1;
    } else if (k == 2 && !cas) {
      n = s[t];
    } else if (k == 2) {  // compare-and-swap, as one step
      ok[t] = n == r[t];
      if (ok[t]) n = s[t];
    } else if (!ok[t]) {  // the swap failed: count it and read again
      retries[t]++;
      pc[t] = 0;
      return true;
    }
    pc[t]++;
    return true;
  }
};
