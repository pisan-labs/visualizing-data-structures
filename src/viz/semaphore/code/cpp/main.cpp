// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Room drives the steps one at a time; "threads" runs a pattern on real
// threads, where the semaphores fix the result.
#include <iostream>
#include <sstream>
#include <string>

#include "semaphores.hpp"

static std::string join(const std::vector<std::string>& xs, const std::string& sep) {
  std::string s;
  for (const auto& x : xs) s += (s.empty() ? "" : sep) + x;
  return s;
}

static std::string show(const Room& r) {
  std::string line;
  for (int t : r.line) line += (line.empty() ? "" : ",") + ("T" + std::to_string(t + 1));
  std::string out = join(r.out, ",");
  return "s=" + std::to_string(r.s) + " line=" + (line.empty() ? "-" : line) +
         " out=" + (out.empty() ? "-" : out);
}

int main() {
  std::string raw;
  int room = 0;
  Room r(0);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      in >> room;
      r = Room(room);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= 3)
        std::cout << "none\n";
      else if (r.step(t))
        std::cout << show(r) << "\n";
      else
        std::cout << (r.waits(t) ? "waits" : "done") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      r = Room(room);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= 3 || !r.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(r) : "stopped") << "\n";
    } else if (op == "reset") {
      r = Room(room);
      std::cout << "s=" << room << "\n";
    } else if (op == "threads") {
      std::string pattern;
      int k;
      in >> pattern >> k;
      if (pattern == "limit")
        std::cout << (limit(3, k) <= k ? "ok" : "too many") << "\n";
      else
        std::cout << join(pattern == "first" ? first() : turns(2), " ") << "\n";
    }
  }
}
