// A bounded buffer with a lock and two condition variables. put waits while the buffer is full,
// get waits while it is empty, and each wakes the other side. The waits sit in while loops: a
// woken thread does not run at once, and by the time it has the lock again another thread may
// have taken the item (or the room).
//
// Steps runs the page's program one step at a time instead (P1 puts one item, C1 and C2 take
// one each), so a caller can pick the interleaving. It keeps the lock and the condition
// variables by hand: one test thread cannot hold a real mutex for another.
#pragma once
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

class BoundedBuffer {
 public:
  explicit BoundedBuffer(std::size_t size) : size_(size) {}

  void put(int x) {
    std::unique_lock<std::mutex> lock(m_);
    while (items_.size() == size_) room_.wait(lock);  // while, not if
    items_.push_back(x);
    item_.notify_one();  // wake a consumer, if one sleeps
  }

  int get() {
    std::unique_lock<std::mutex> lock(m_);
    while (items_.empty()) item_.wait(lock);
    int x = items_.front();
    items_.pop_front();
    room_.notify_one();  // wake the producer, if it sleeps
    return x;
  }

  std::size_t left() {
    std::lock_guard<std::mutex> lock(m_);
    return items_.size();
  }

 private:
  std::size_t size_;
  std::deque<int> items_;
  std::mutex m_;
  std::condition_variable room_;  // put waits here while full
  std::condition_variable item_;  // get waits here while empty
};

// A producer puts 1 to 6; two consumers take 3 each. Returns {sum taken, left}.
inline std::pair<int, int> run_threads(int size) {
  BoundedBuffer buf(size);
  int sums[2] = {0, 0};
  std::vector<std::thread> threads;
  for (int c = 0; c < 2; c++)
    threads.emplace_back([&buf, &sums, c] {
      for (int i = 0; i < 3; i++) sums[c] += buf.get();
    });
  threads.emplace_back([&buf] {
    for (int x = 1; x <= 6; x++) buf.put(x);
  });
  for (auto& th : threads) th.join();
  return {sums[0] + sums[1], static_cast<int>(buf.left())};
}

// P1 (t = 0) puts one item, C1 and C2 take one each. Each thread runs: 0 lock(m),
// 1 t: r = n < size (P1) or n > 0 (C), 2 if r goto 5, 3 wait(cv, m), 4 goto t,
// 5 r = n + 1 or n - 1, 6 n = r, 7 signal(other cv), 8 unlock(m).
class Steps {
 public:
  Steps(int size, int start) : size(size), n(start) {}

  int size;
  int n;
  int holder = -1;        // who holds m, or -1
  std::deque<int> line;   // waiting for m
  std::deque<int> room;   // asleep on room (the producer)
  std::deque<int> item;   // asleep on item (consumers)
  int pc[3] = {0, 0, 0};
  int r[3] = {0, 0, 0};
  bool blocked[3] = {false, false, false};

  // Let go of m: hand it to the first in line, whose lock or wait returns.
  void release() {
    holder = -1;
    if (!line.empty()) {
      holder = line.front();
      line.pop_front();
      blocked[holder] = false;
      pc[holder]++;
    }
  }

  // Runs thread t's next step. False if it is done or blocked.
  bool step(int t) {
    if (pc[t] == 9 || blocked[t]) return false;
    bool producer = t == 0;
    switch (pc[t]) {
      case 0:  // lock(m)
        if (holder >= 0) {
          line.push_back(t);
          blocked[t] = true;
          return true;
        }
        holder = t;
        break;
      case 1: r[t] = (producer ? n < size : n > 0) ? 1 : 0; break;
      case 2:
        if (r[t] == 1) {
          pc[t] = 5;
          return true;
        }
        break;
      case 3:  // wait: let go of m and sleep
        release();
        (producer ? room : item).push_back(t);
        blocked[t] = true;
        return true;
      case 4:  // goto t: check again
        pc[t] = 1;
        return true;
      case 5: r[t] = n + (producer ? 1 : -1); break;
      case 6: n = r[t]; break;
      case 7: {  // signal: the woken thread must get m back first
        std::deque<int>& q = producer ? item : room;
        if (!q.empty()) {
          line.push_back(q.front());
          q.pop_front();
        }
        break;
      }
      default: release();
    }
    pc[t]++;
    return true;
  }
};
