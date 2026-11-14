// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so Table drives the steps one at a time; "threads" runs real philosophers with
// each fix, which always all eat.
#include <iostream>
#include <sstream>
#include <string>

#include "dining.hpp"

static std::string name(int t) { return t < 0 ? "-" : "P" + std::to_string(t + 1); }

static std::string join(const std::vector<std::string>& xs) {
  std::string out;
  for (const auto& x : xs) out += (out.empty() ? "" : ",") + x;
  return out.empty() ? "-" : out;
}

static std::string show(const Table& c) {
  std::vector<std::string> forks, waiting, ate;
  for (int h : c.holder) forks.push_back(name(h));
  for (int t = 0; t < c.n; t++)
    if (!c.waits[t].empty()) waiting.push_back(name(t) + ":" + c.waits[t]);
  for (int t : c.ate) ate.push_back(name(t));
  return "forks=" + join(forks) + " waiting=" + join(waiting) + " ate=" + join(ate) +
         (c.fix == "waiter" ? " waiter=" + std::to_string(c.seats) : "");
}

int main() {
  std::string raw;
  int n = 3;
  std::string fix = "none";
  Table c(n, fix);
  while (std::getline(std::cin, raw)) {
    std::istringstream in(raw);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      in >> n >> fix;
      c = Table(n, fix);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= n)
        std::cout << "none\n";
      else if (c.step(t))
        std::cout << show(c) << "\n";
      else
        std::cout << (c.waits[t].empty() ? "done" : "waits") << "\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = Table(n, fix);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= n || !c.step(t)) {
          ok = false;
          break;
        }
      }
      std::cout << (ok ? show(c) : "stopped") << "\n";
    } else if (op == "reset") {
      c = Table(n, fix);
      std::cout << "free\n";
    } else if (op == "threads") {
      int meals = 200;
      bool fed = true;
      for (const char* f : {"order", "waiter"})
        for (int m : dine(n, meals, f)) fed = fed && m == meals;
      std::cout << (fed ? "fed" : "hungry") << "\n";
    }
  }
}
