// Two locks, taken in one global order, so no deadlock. with_both is what you write with real
// threads: it takes the two locks in order of their names, so every thread takes a before b,
// whatever order it asks in. (std::scoped_lock can take both at once without deadlock too.)
//
// Steps runs the page's program one step at a time instead (each thread locks its two locks in
// its own order, then unlocks them), keeping the locks by hand, so a caller can pick the
// interleaving; find_cycle looks for a cycle in the wait-for graph.
#pragma once
#include <algorithm>
#include <deque>
#include <functional>
#include <map>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

using Order = std::pair<char, char>;  // the two locks a thread asks for, in its order

// Take locks x and y in one global order (by name), run work, let go.
inline void with_both(std::map<char, std::mutex>& locks, char x, char y,
                      const std::function<void()>& work) {
  std::lock_guard<std::mutex> first(locks[std::min(x, y)]);
  std::lock_guard<std::mutex> second(locks[std::max(x, y)]);
  work();
}

// Real threads, each asking for its two locks in its own order, all at once. Returns how many
// times the work ran: every round of every thread.
inline int run_threads(const std::vector<Order>& orders, int rounds) {
  std::map<char, std::mutex> locks;
  locks['a'];
  locks['b'];
  int done = 0;
  std::vector<std::thread> threads;
  for (const Order& o : orders)
    threads.emplace_back([&locks, &done, o, rounds] {
      for (int i = 0; i < rounds; i++) with_both(locks, o.first, o.second, [&done] { done++; });
    });
  for (auto& th : threads) th.join();
  return done;
}

// Thread t runs lock(x), lock(y), unlock(y), unlock(x), where (x, y) = orders[t].
class Steps {
 public:
  explicit Steps(std::vector<Order> orders)
      : orders(std::move(orders)), pc(this->orders.size(), 0), waits_for(this->orders.size(), 0) {}

  std::vector<Order> orders;
  std::map<char, int> holder{{'a', -1}, {'b', -1}};  // who holds each lock, or -1
  std::map<char, std::deque<int>> line;               // who waits for each
  std::vector<int> pc;
  std::vector<char> waits_for;  // the lock a blocked thread waits for, or 0

  // Runs thread t's next step. False if it is done or waits for a lock.
  bool step(int t) {
    if (pc[t] == 4 || waits_for[t]) return false;
    auto [x, y] = orders[t];
    if (pc[t] < 2) {  // lock(x), then lock(y)
      char name = pc[t] == 0 ? x : y;
      if (holder[name] >= 0) {
        line[name].push_back(t);
        waits_for[t] = name;
        return true;
      }
      holder[name] = t;
    } else {  // unlock(y), then unlock(x): hand it to the first in line
      char name = pc[t] == 2 ? y : x;
      holder[name] = -1;
      if (!line[name].empty()) {
        int next = line[name].front();
        line[name].pop_front();
        holder[name] = next;
        waits_for[next] = 0;
        pc[next]++;  // its lock returns
      }
    }
    pc[t]++;
    return true;
  }

  // Depth-first search of the wait-for graph (t -> the holder of the lock t waits for), gray
  // while on the path and black when done. Returns the first cycle, or an empty list.
  std::vector<int> find_cycle() {
    std::vector<int> color(pc.size(), 0);  // 0 white, 1 gray, 2 black
    std::vector<int> path, found;
    std::function<bool(int)> visit = [&](int u) {
      color[u] = 1;
      path.push_back(u);
      int v = waits_for[u] ? holder[waits_for[u]] : -1;
      if (v >= 0 && color[v] == 1) {  // an edge back to the path
        found.assign(std::find(path.begin(), path.end(), v), path.end());
        return true;
      }
      if (v >= 0 && color[v] == 0 && visit(v)) return true;
      color[u] = 2;
      path.pop_back();
      return false;
    };
    for (int u = 0; u < static_cast<int>(pc.size()); u++)
      if (color[u] == 0 && visit(u)) break;
    return found;
  }
};
