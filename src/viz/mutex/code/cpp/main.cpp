// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the five steps one at a time; "threads" runs Counter on real
// threads at once, which the lock keeps right.
#include <iostream>
#include <sstream>
#include <string>

#include "counter.hpp"

static std::string name(int t) { return t < 0 ? "-" : "T" + std::to_string(t + 1); }

static std::string show(const Steps& c) {
  std::string line;
  for (int t : c.line) line += (line.empty() ? "" : ",") + name(t);
  return "count=" + std::to_string(c.count) + " holder=" + name(c.holder) +
         " line=" + (line.empty() ? "-" : line);
}

int main() {
  std::string raw;
  int k = 0;
  Steps c(0);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      in >> k;
      c = Steps(k);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= k)
        std::cout << "none\n";
      else if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.waits(t) ? "waits" : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(k);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= k || !c.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "reset") {
      c = Steps(k);
      std::cout << "count=0\n";
    } else if (op == "threads") {
      std::cout << run_threads(k) << "\n";
    }
  }
}
