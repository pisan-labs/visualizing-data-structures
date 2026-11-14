// count = count + 1 inside a lock, so no update is lost. Counter is what you write with real
// threads: std::lock_guard takes the mutex and lets go of it when it goes out of scope, after
// the store. Steps runs the same five steps one at a time, so a caller can pick the
// interleaving; it keeps the lock by hand (who holds it, who waits in line), because one test
// thread cannot hold a real mutex "for" another.
#pragma once
#include <algorithm>
#include <deque>
#include <mutex>
#include <thread>
#include <vector>

class Counter {
 public:
  int count = 0;

  void increment() {
    std::lock_guard<std::mutex> guard(m_);  // lock(m) ... unlock(m)
    int r = count;                          // load
    r = r + 1;                              // add, in a local variable
    count = r;                              // store
  }

 private:
  std::mutex m_;
};

// k real threads each increment once, all at the same time.
inline int run_threads(int k) {
  Counter c;
  std::vector<std::thread> threads;
  for (int i = 0; i < k; i++) threads.emplace_back([&c] { c.increment(); });
  for (auto& th : threads) th.join();
  return c.count;
}

// k threads, each: lock(m), r = count, r = r + 1, count = r, unlock(m).
class Steps {
 public:
  explicit Steps(int k) : pc(k, 0), reg(k, 0) {}

  int count = 0;
  int holder = -1;      // the thread that holds m, or -1
  std::deque<int> line;  // threads waiting for m, first in line first
  std::vector<int> pc;   // each thread's next step
  std::vector<int> reg;  // each thread's r

  bool waits(int t) const { return std::find(line.begin(), line.end(), t) != line.end(); }

  // Runs thread t's next step. False if it is done or waits in line.
  bool step(int t) {
    if (pc[t] == 5 || waits(t)) return false;
    switch (pc[t]) {
      case 0:  // lock(m)
        if (holder >= 0) {
          line.push_back(t);  // wait; this thread takes no more steps
          return true;
        }
        holder = t;
        break;
      case 1: reg[t] = count; break;
      case 2: reg[t] = reg[t] + 1; break;
      case 3: count = reg[t]; break;
      default:  // unlock(m): hand m to the first in line, whose lock(m) returns
        holder = -1;
        if (!line.empty()) {
          holder = line.front();
          line.pop_front();
          pc[holder] = 1;
        }
    }
    pc[t]++;
    return true;
  }
};
