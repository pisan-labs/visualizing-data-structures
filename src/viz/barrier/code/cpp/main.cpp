// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the steps one at a time; "threads" runs real threads at both
// barriers, where nobody goes on early.
#include <iostream>
#include <sstream>
#include <string>

#include "barrier.hpp"

template <typename List>
static std::string names(const List& ts) {
  std::string out;
  for (int t : ts) out += (out.empty() ? "T" : ",T") + std::to_string(t + 1);
  return out.empty() ? "-" : out;
}

static std::string show(const Steps& c) {
  std::vector<int> early;
  for (int t = 0; t < 3; t++)
    if (c.early[t]) early.push_back(t);
  return "count=" + std::to_string(c.count) + " b=" + std::to_string(c.b) +
         " waiting=" + names(c.line) + " early=" + names(early);
}

int main() {
  std::string raw;
  bool naive = false;
  Steps c(naive);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      std::string problem, flag;
      in >> problem >> flag;
      naive = flag == "1";
      c = Steps(naive);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= 3)
        std::cout << "none\n";
      else if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.blocked[t] ? "waits" : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(naive);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= 3 || !c.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "reset") {
      c = Steps(naive);
      std::cout << "count=0\n";
    } else if (op == "threads") {
      std::cout << (run_threads(3, 100) == 0 ? "ok" : "early") << "\n";
    }
  }
}
