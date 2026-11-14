// Dining philosophers on real threads, with both fixes. dine is what you write with real
// threads. Each fork is a std::mutex. "order": every philosopher takes the lower-numbered of
// its forks first, so the last one takes its right fork first; one global order, so no cycle
// of waits. "waiter": a semaphore that starts at n - 1 lets at most n - 1 reach for forks.
// C++17 has no semaphore (C++20 adds std::counting_semaphore), so Semaphore is a mutex and a
// condition variable.
//
// Table runs the page's program one step at a time instead, keeping the forks by hand, so a
// caller can pick the interleaving (and find the deadlock).
#pragma once
#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <utility>
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

// The two forks philosopher i takes, in its order. Its left fork is i, its right i + 1.
inline std::pair<int, int> forks_of(int n, int i, const std::string& fix) {
  int left = i, right = (i + 1) % n;
  if (fix == "order" && i == n - 1) return {right, left};
  return {left, right};
}

// n philosophers each eat `meals` times, on real threads. Returns the meals eaten.
inline std::vector<int> dine(int n, int meals, const std::string& fix) {
  std::vector<std::mutex> forks(n);
  Semaphore waiter(n - 1);
  std::vector<int> eaten(n, 0);
  std::vector<std::thread> threads;
  for (int i = 0; i < n; i++)
    threads.emplace_back([&, i] {
      auto [first, second] = forks_of(n, i, fix);
      for (int k = 0; k < meals; k++) {
        if (fix == "waiter") waiter.P();
        {
          std::lock_guard<std::mutex> a(forks[first]);
          std::lock_guard<std::mutex> b(forks[second]);
          eaten[i]++;  // eat: only philosopher i writes eaten[i]
        }
        if (fix == "waiter") waiter.V();
      }
    });
  for (auto& th : threads) th.join();
  return eaten;
}

// Philosopher t: [sit], take its first fork, take its second, eat, put the second down, put the
// first down, [leave]. sit and leave are the waiter's P and V.
class Table {
 public:
  enum Kind { Take, Put, Eat, Sit, Leave };

  Table(int n, std::string fix)
      : n(n), fix(std::move(fix)), holder(n, -1), line(n), seats(n - 1), pc(n, 0), waits(n) {
    for (int t = 0; t < n; t++) {
      auto [a, b] = forks_of(n, t, this->fix);
      std::vector<std::pair<Kind, int>> plan{{Take, a}, {Take, b}, {Eat, t}, {Put, b}, {Put, a}};
      if (this->fix == "waiter") {
        plan.insert(plan.begin(), {Sit, 0});
        plan.push_back({Leave, 0});
      }
      plans.push_back(plan);
    }
  }

  int n;
  std::string fix;
  std::vector<int> holder;             // who holds each fork, or -1
  std::vector<std::deque<int>> line;   // who waits for each fork
  int seats;                           // the waiter; below 0 it counts those waiting
  std::deque<int> seat_line;
  std::vector<int> pc;
  std::vector<std::string> waits;      // "f2" or "waiter" while blocked
  std::vector<int> ate;
  std::vector<std::vector<std::pair<Kind, int>>> plans;

  // Runs philosopher t's next step. False if it is done or waits.
  bool step(int t) {
    if (pc[t] == static_cast<int>(plans[t].size()) || !waits[t].empty()) return false;
    auto [kind, f] = plans[t][pc[t]];
    if (kind == Take && holder[f] >= 0) {
      line[f].push_back(t);
      waits[t] = "f" + std::to_string(f + 1);
      return true;
    }
    if (kind == Take) {
      holder[f] = t;
    } else if (kind == Put) {  // hand it to the first in line, if any
      holder[f] = -1;
      if (!line[f].empty()) {
        holder[f] = line[f].front();
        line[f].pop_front();
        wake(holder[f]);
      }
    } else if (kind == Eat) {
      ate.push_back(t);
    } else if (kind == Sit) {
      if (--seats < 0) {
        seat_line.push_back(t);
        waits[t] = "waiter";
        return true;
      }
    } else {
      seats++;
      if (!seat_line.empty()) {
        int w = seat_line.front();
        seat_line.pop_front();
        wake(w);
      }
    }
    pc[t]++;
    return true;
  }

 private:
  void wake(int t) {
    waits[t].clear();
    pc[t]++;  // its take or sit returns
  }
};
