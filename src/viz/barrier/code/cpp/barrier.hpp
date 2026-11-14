// Barriers on real threads: nobody goes on until all n have arrived. OneShot is Downey's
// barrier: a count guarded by a mutex, and a semaphore that starts at 0 as a turnstile. Barrier
// is his reusable two-phase barrier with preloaded turnstiles: the last to arrive lets all n
// through the first, and the last to leave lets all n through the second, so nobody can lap the
// others. (C++20 adds std::barrier.) C++17 has no semaphore, so Semaphore is a mutex and a
// condition variable.
//
// Steps runs the page's barrier one step at a time instead, keeping the semaphore by hand, so a
// caller can pick the interleaving.
#pragma once
#include <algorithm>
#include <condition_variable>
#include <deque>
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
  void V(int k = 1) {  // give k back, and wake waiting threads
    {
      std::lock_guard<std::mutex> lock(m_);
      value_ += k;
    }
    ready_.notify_all();
  }

 private:
  int value_;
  std::mutex m_;
  std::condition_variable ready_;
};

class OneShot {
 public:
  explicit OneShot(int n) : n_(n) {}
  void wait() {
    int r;
    {
      std::lock_guard<std::mutex> g(m_);
      r = ++count_;
    }
    if (r == n_) b_.V();  // the last to arrive opens the turnstile
    b_.P();               // P(b)
    b_.V();               // V(b): let the next one through
  }

 private:
  int n_, count_ = 0;
  std::mutex m_;  // guards count_
  Semaphore b_{0};
};

class Barrier {
 public:
  explicit Barrier(int n) : n_(n) {}
  void wait() {
    {
      std::lock_guard<std::mutex> g(m_);
      if (++count_ == n_) b1_.V(n_);  // let all n through the first turnstile
    }
    b1_.P();
    {
      std::lock_guard<std::mutex> g(m_);
      if (--count_ == 0) b2_.V(n_);  // and all n through the second
    }
    b2_.P();
  }

 private:
  int n_, count_ = 0;
  std::mutex m_;
  Semaphore b1_{0}, b2_{0};
};

// n real threads at a one-shot barrier, then `rounds` times round a reusable one. Returns how
// many times a thread went on before all had arrived (0 when it works).
inline int run_threads(int n, int rounds) {
  std::mutex guard;
  std::vector<int> arrived(n, 0);
  int bad = 0;
  OneShot once(n);
  Barrier again(n);
  std::vector<std::thread> threads;
  for (int i = 0; i < n; i++)
    threads.emplace_back([&, i] {
      for (int k = 1; k <= rounds + 1; k++) {
        {
          std::lock_guard<std::mutex> g(guard);
          arrived[i]++;
        }
        if (k == 1)
          once.wait();
        else
          again.wait();
        std::lock_guard<std::mutex> g(guard);
        if (*std::min_element(arrived.begin(), arrived.end()) < k) bad++;
      }
    });
  for (auto& th : threads) th.join();
  return bad;
}

// Thread t: count += 1 (r = count); if r == 3: V(b); P(b); V(b); go. Naive: count += 1, then
// go. go notes a thread that leaves while count < 3.
class Steps {
 public:
  explicit Steps(bool naive)
      : plan(naive ? std::vector<std::string>{"arrive", "go"}
                   : std::vector<std::string>{"arrive", "last", "P", "V", "go"}) {}

  int count = 0, b = 0;
  std::deque<int> line;
  std::vector<int> pc = std::vector<int>(3, 0), r = std::vector<int>(3, 0);
  std::vector<bool> blocked = std::vector<bool>(3, false), early = std::vector<bool>(3, false);
  std::vector<std::string> plan;

  // Runs thread t's next step. False if it is done or waits.
  bool step(int t) {
    if (pc[t] == static_cast<int>(plan.size()) || blocked[t]) return false;
    const std::string& what = plan[pc[t]];
    if (what == "arrive") {
      r[t] = ++count;
    } else if (what == "last") {
      if (r[t] == 3) up();
    } else if (what == "P") {
      if (--b < 0) {
        line.push_back(t);
        blocked[t] = true;
        return true;
      }
    } else if (what == "V") {
      up();
    } else {
      early[t] = count < 3;
    }
    pc[t]++;
    return true;
  }

 private:
  void up() {
    b++;
    if (!line.empty()) {  // the first waiting goes on: its P returns
      int w = line.front();
      line.pop_front();
      blocked[w] = false;
      pc[w]++;
    }
  }
};
