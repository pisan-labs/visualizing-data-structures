// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the steps one at a time; "threads" runs real readers and a
// writer on RwLock, which never share the room with a writer.
#include <iostream>
#include <sstream>
#include <string>

#include "rwlock.hpp"

static std::string name(int t) { return t == 0 ? "W" : "R" + std::to_string(t); }

static std::string show(const Steps& c) {
  std::string waiting;
  for (int t = 0; t < static_cast<int>(c.waits.size()); t++)
    if (!c.waits[t].empty()) waiting += (waiting.empty() ? "" : ",") + name(t) + ":" + c.waits[t];
  return "n=" + std::to_string(c.n) + " room=" + std::to_string(c.room) +
         " m=" + (c.holder < 0 ? "-" : name(c.holder)) + " waiting=" + (waiting.empty() ? "-" : waiting);
}

int main() {
  std::string raw;
  int k = 2;
  Steps c(k);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      std::string variant;
      in >> variant >> k;
      c = Steps(k);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t > k)
        std::cout << "none\n";
      else if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.waits[t].empty() ? "done" : "waits") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(k);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t > k || !c.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "reset") {
      c = Steps(k);
      std::cout << "n=0\n";
    } else if (op == "threads") {
      int bad = run_threads(k, 200, false) + run_threads(k, 200, true);
      std::cout << (bad == 0 ? "ok" : "shared") << "\n";
    }
  }
}
