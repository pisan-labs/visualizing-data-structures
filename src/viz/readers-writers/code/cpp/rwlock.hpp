// A read-write lock from a lock, a count and a semaphore (Downey's lightswitch). Readers share
// the room; a writer needs it alone. n counts the readers inside and the mutex m guards n. The
// first reader in takes room, which keeps writers out; the last one out gives it back. With
// no_starve, everyone also passes a turnstile, which a waiting writer holds, so readers who come
// after it wait behind it. (C++17's std::shared_mutex is the library's version.) C++17 has no
// semaphore, so Semaphore is a mutex and a condition variable.
//
// Steps runs the page's program (readers first) one step at a time instead, keeping the lock and
// the semaphore by hand, so a caller can pick the interleaving.
#pragma once
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

class RwLock {
 public:
  explicit RwLock(bool no_starve) : no_starve_(no_starve) {}

  void read_lock() {
    if (no_starve_) {
      turn_.P();
      turn_.V();
    }
    std::lock_guard<std::mutex> g(m_);
    if (++n_ == 1) room_.P();  // the first reader in locks the writers out
  }
  void read_unlock() {
    std::lock_guard<std::mutex> g(m_);
    if (--n_ == 0) room_.V();  // the last reader out lets them in
  }
  void write_lock() {
    if (no_starve_) turn_.P();
    room_.P();
  }
  void write_unlock() {
    if (no_starve_) turn_.V();
    room_.V();
  }

 private:
  bool no_starve_;
  std::mutex m_;  // guards n_
  int n_ = 0;     // readers inside
  Semaphore room_{1}, turn_{1};
};

// k readers and one writer, `rounds` visits each. Returns how many times a thread found the room
// shared with a writer (0 when the lock works).
inline int run_threads(int k, int rounds, bool no_starve) {
  RwLock rw(no_starve);
  std::mutex guard;
  int readers = 0, writers = 0, bad = 0;
  auto visit = [&](int& mine) {
    {
      std::lock_guard<std::mutex> g(guard);
      mine++;
      if (writers && (readers || writers > 1)) bad++;
    }
    std::lock_guard<std::mutex> g(guard);
    mine--;
  };
  std::vector<std::thread> threads;
  threads.emplace_back([&] {
    for (int i = 0; i < rounds; i++) {
      rw.write_lock();
      visit(writers);
      rw.write_unlock();
    }
  });
  for (int j = 0; j < k; j++)
    threads.emplace_back([&] {
      for (int i = 0; i < rounds; i++) {
        rw.read_lock();
        visit(readers);
        rw.read_unlock();
      }
    });
  for (auto& th : threads) th.join();
  return bad;
}

// The page's steps. Writer (thread 0): P(room), write, V(room). Reader: lock(m) and n += 1; if
// n == 1: P(room), then unlock(m); read; lock(m) and n -= 1; if n == 0: V(room), then unlock(m).
// Each pair is one step unless it waits in the middle.
class Steps {
 public:
  using Plan = std::vector<std::vector<std::string>>;

  explicit Steps(int k) : row(k + 1), part(k + 1), r(k + 1), waits(k + 1) {
    plans.push_back({{"P"}, {"write"}, {"V"}});
    for (int t = 1; t <= k; t++)
      plans.push_back({{"lock", "add"}, {"first", "unlock"}, {"read"}, {"lock", "sub"}, {"last", "unlock"}});
  }

  int n = 0, room = 1, holder = -1;  // holder of m, or -1
  std::deque<int> m_line, room_line;
  std::vector<Plan> plans;
  std::vector<int> row, part, r;
  std::vector<std::string> waits;  // "m" or "room" while blocked

  bool done(int t) const { return row[t] == static_cast<int>(plans[t].size()); }

  // Runs thread t's next step (one row). False if it is done or waits.
  bool step(int t) {
    if (done(t) || !waits[t].empty()) return false;
    int at = row[t];
    while (!done(t) && row[t] == at && waits[t].empty()) do_part(t, plans[t][at][part[t]]);
    return true;
  }

 private:
  void advance(int t) {
    if (part[t] + 1 < static_cast<int>(plans[t][row[t]].size())) {
      part[t]++;
    } else {
      row[t]++;
      part[t] = 0;
    }
  }

  void do_part(int t, const std::string& what) {
    if (what == "lock" && holder >= 0) {
      m_line.push_back(t);
      waits[t] = "m";
      return;
    }
    if (what == "lock") {
      holder = t;
    } else if (what == "unlock") {  // hand m to the first in line
      holder = -1;
      if (!m_line.empty()) {
        holder = m_line.front();
        m_line.pop_front();
        wake(holder);
      }
    } else if (what == "add" || what == "sub") {
      n += what == "add" ? 1 : -1;
      r[t] = n;
    } else if (what == "P" || (what == "first" && r[t] == 1)) {
      if (--room < 0) {
        room_line.push_back(t);
        waits[t] = "room";
        return;
      }
    } else if (what == "V" || (what == "last" && r[t] == 0)) {
      room++;
      if (!room_line.empty()) {
        int w = room_line.front();
        room_line.pop_front();
        wake(w);
      }
    }
    advance(t);
  }

  void wake(int t) {
    waits[t].clear();
    advance(t);  // its lock or P returns
  }
};
