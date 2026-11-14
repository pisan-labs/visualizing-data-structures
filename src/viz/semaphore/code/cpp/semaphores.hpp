// Three patterns from The Little Book of Semaphores, on real threads. limit: a semaphore that
// starts at k lets at most k threads inside at once. first: a semaphore that starts at 0 makes
// T2 wait for T1's signal. turns: two semaphores make two threads take turns.
//
// C++17 has no semaphore (C++20 adds std::counting_semaphore), so Semaphore builds one from a
// mutex and a condition variable. Room runs the limit pattern one step at a time instead, so a
// caller can pick the interleaving; its s goes below 0 to count the waiting threads.
#pragma once
#include <algorithm>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class Semaphore {
 public:
  explicit Semaphore(int value) : value_(value) {}

  void P() {  // take one; wait while there is none
    std::unique_lock<std::mutex> lock(m_);
    ready_.wait(lock, [this] { return value_ > 0; });
    value_--;
  }

  void V() {  // give one back, and wake a waiting thread
    {
      std::lock_guard<std::mutex> lock(m_);
      value_++;
    }
    ready_.notify_one();
  }

 private:
  int value_;
  std::mutex m_;
  std::condition_variable ready_;
};

inline void run_all(const std::vector<std::function<void()>>& jobs) {
  std::vector<std::thread> threads;
  for (const auto& job : jobs) threads.emplace_back(job);
  for (auto& th : threads) th.join();
}

// k threads go in and out of a room; returns the most inside at once.
inline int limit(int k, int room) {
  Semaphore s(room);
  std::mutex guard;  // for the inside count only
  int inside = 0, most = 0;
  auto work = [&] {
    s.P();
    {
      std::lock_guard<std::mutex> g(guard);
      inside++;  // in
      most = std::max(most, inside);
    }
    {
      std::lock_guard<std::mutex> g(guard);
      inside--;  // out
    }
    s.V();
  };
  run_all(std::vector<std::function<void()>>(k, work));
  return most;
}

inline std::vector<std::string> first() {
  Semaphore a(0);
  std::vector<std::string> out;
  auto t1 = [&] {
    out.push_back("one");
    a.V();
  };
  auto t2 = [&] {
    a.P();  // wait for T1
    out.push_back("two");
  };
  run_all({t2, t1});  // T2 starts first, and still prints second
  return out;
}

inline std::vector<std::string> turns(int times) {
  Semaphore a(1), b(0);
  std::vector<std::string> out;
  auto take = [&](Semaphore& mine, Semaphore& theirs, const char* word) {
    for (int i = 0; i < times; i++) {
      mine.P();  // wait for my turn
      out.push_back(word);
      theirs.V();  // hand the turn over
    }
  };
  run_all({[&] { take(b, a, "pong"); }, [&] { take(a, b, "ping"); }});
  return out;
}

// 3 threads, each: P(s), print("in"), print("out"), V(s).
class Room {
 public:
  explicit Room(int room) : s(room), pc(3, 0) {}

  int s;
  std::deque<int> line;  // threads waiting on s, first come first
  std::vector<int> pc;   // each thread's next step
  std::vector<std::string> out;

  bool waits(int t) const { return std::find(line.begin(), line.end(), t) != line.end(); }

  // Runs thread t's next step. False if it is done or waits on s.
  bool step(int t) {
    if (pc[t] == 4 || waits(t)) return false;
    switch (pc[t]) {
      case 0:  // P(s)
        s--;
        if (s < 0) {
          line.push_back(t);  // wait; this thread takes no more steps
          return true;
        }
        break;
      case 1: out.push_back("in"); break;
      case 2: out.push_back("out"); break;
      default:  // V(s): wake the first waiting thread, whose P(s) returns
        s++;
        if (!line.empty()) {
          pc[line.front()] = 1;
          line.pop_front();
        }
    }
    pc[t]++;
    return true;
  }
};
