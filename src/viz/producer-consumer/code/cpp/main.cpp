// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the steps one at a time; "threads" runs BoundedBuffer on real
// threads, where every item gets through once.
#include <iostream>
#include <sstream>
#include <string>

#include "buffer.hpp"

static const char* NAMES[] = {"P1", "C1", "C2"};

static std::string names(const std::deque<int>& ts) {
  std::string s;
  for (int t : ts) s += (s.empty() ? "" : ",") + std::string(NAMES[t]);
  return s.empty() ? "-" : s;
}

static std::string show(const Steps& c) {
  return "n=" + std::to_string(c.n) + " holder=" + (c.holder < 0 ? "-" : NAMES[c.holder]) +
         " line=" + names(c.line) + " room=" + names(c.room) + " item=" + names(c.item);
}

int main() {
  std::string raw;
  int size = 0, start = 0;
  Steps c(0, 0);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      in >> size >> start;
      c = Steps(size, start);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.blocked[t] ? "waits" : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(size, start);
      bool ok = true;
      for (char d : sched) {
        if (!c.step(d - '1')) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "reset") {
      c = Steps(size, start);
      std::cout << "n=" << start << "\n";
    } else if (op == "threads") {
      int k;
      in >> k;
      auto [total, left] = run_threads(k);
      std::cout << total << " " << left << "\n";
    }
  }
}
