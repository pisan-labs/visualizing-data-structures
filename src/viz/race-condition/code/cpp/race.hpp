// count = count + 1 is three steps: load, add, store. Race runs the increments of several
// threads one step at a time, so a caller can pick the interleaving; run_threads hands the
// choice to real threads instead. count is atomic so that the race is a lost update, not
// undefined behavior: its load and its store are still two separate steps.
#pragma once
#include <atomic>
#include <map>
#include <thread>
#include <vector>

class Race {
 public:
  Race(int threads, int times) : pc(threads, 0), reg(threads, 0), steps_(3 * times) {}
  Race(const Race& o) : count(o.count.load()), pc(o.pc), reg(o.reg), steps_(o.steps_) {}

  std::atomic<int> count{0};  // shared by every thread
  std::vector<int> pc;        // each thread's next step
  std::vector<int> reg;       // each thread's register

  // Runs thread t's next step. False if it has no steps left.
  bool step(int t) {
    if (pc[t] == steps_) return false;
    switch (pc[t] % 3) {
      case 0: reg[t] = count.load(); break;  // load
      case 1: reg[t] = reg[t] + 1; break;     // add
      default: count.store(reg[t]);           // store
    }
    pc[t]++;
    return true;
  }

  // Runs every thread to the end on real threads. The scheduler may switch threads between a
  // load and its store, so count can come out short. One at a time, each thread finishes
  // before the next starts.
  int run_threads(bool one_at_a_time) {
    std::vector<std::thread> threads;
    for (int t = 0; t < static_cast<int>(pc.size()); t++) {
      threads.emplace_back([this, t] {
        while (step(t)) {
        }
      });
      if (one_at_a_time) threads.back().join();
    }
    for (auto& th : threads)
      if (th.joinable()) th.join();
    return count.load();
  }

 private:
  int steps_;  // each thread adds 1, `times` times
};

// Every interleaving from start: final count -> how many schedules.
inline void explore(const Race& r, std::map<int, long>& found) {
  bool moved = false;
  for (int t = 0; t < static_cast<int>(r.pc.size()); t++) {
    Race next(r);
    if (next.step(t)) {
      moved = true;
      explore(next, found);
    }
  }
  if (!moved) found[r.count.load()]++;
}

inline std::map<int, long> outcomes(const Race& start) {
  std::map<int, long> found;
  explore(start, found);
  return found;
}
