// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the steps one at a time; "threads" runs real threads that take
// the locks in one global order, which never deadlock.
#include <iostream>
#include <sstream>
#include <string>

#include "locks.hpp"

static std::string name(int t) { return t < 0 ? "-" : "T" + std::to_string(t + 1); }

static std::string show(Steps& c) {
  std::string waiting;
  for (int t = 0; t < static_cast<int>(c.waits_for.size()); t++)
    if (c.waits_for[t])
      waiting += (waiting.empty() ? "" : ",") + name(t) + ":" + std::string(1, c.waits_for[t]);
  return "a=" + name(c.holder['a']) + " b=" + name(c.holder['b']) +
         " waiting=" + (waiting.empty() ? "-" : waiting);
}

int main() {
  std::string raw;
  std::vector<Order> orders;
  Steps c(orders);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      int k;
      std::string order;
      in >> k >> order;
      orders.clear();
      for (int t = 0; t < k; t++)
        orders.push_back(order == "opposite" && t == 1 ? Order{'b', 'a'} : Order{'a', 'b'});
      c = Steps(orders);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= static_cast<int>(orders.size()))
        std::cout << "none\n";
      else if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.waits_for[t] ? "waits" : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(orders);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= static_cast<int>(orders.size()) || !c.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "cycle") {
      std::vector<int> found = c.find_cycle();
      if (found.empty()) std::cout << "none";
      for (std::size_t i = 0; i < found.size(); i++) std::cout << (i ? " " : "") << name(found[i]);
      std::cout << "\n";
    } else if (op == "reset") {
      c = Steps(orders);
      std::cout << "free\n";
    } else if (op == "threads") {
      int rounds = 200;
      std::cout << (run_threads(orders, rounds) == rounds * static_cast<int>(orders.size()) ? "done" : "lost")
                << "\n";
    }
  }
}
