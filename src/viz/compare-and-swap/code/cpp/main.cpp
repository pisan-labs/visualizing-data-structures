// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Steps drives the steps one at a time; "threads" runs real threads with the
// cas loop, which never lose an update.
#include <iostream>
#include <sstream>
#include <string>

#include "cas.hpp"

static std::string show(const Steps& c) {
  std::string r;
  for (int x : c.retries) r += (r.empty() ? "" : ",") + std::to_string(x);
  return "n=" + std::to_string(c.n) + " retries=" + r;
}

int main() {
  std::string raw;
  int k = 2;
  bool cas = true;
  Steps c(k, cas);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      std::string program;
      in >> program >> k;
      cas = program != "plain";
      c = Steps(k, cas);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= k)
        std::cout << "none\n";
      else
        std::cout << (c.step(t) ? show(c) : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Steps(k, cas);
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
      c = Steps(k, cas);
      std::cout << "n=0\n";
    } else if (op == "threads") {
      int n, times = 1000;
      in >> n;
      std::cout << (run_threads(n, times) == n * times ? "ok" : "lost") << "\n";
    }
  }
}
