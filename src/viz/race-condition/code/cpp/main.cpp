// Test driver: reads one operation per line, prints one result per line. Real threads are not
// deterministic, so the steps are driven one at a time here, and the real threads run one at a
// time (each joined before the next starts).
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "race.hpp"

int main() {
  std::string line;
  int threads = 0, times = 0;
  std::unique_ptr<Race> c;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line);
    std::string op;
    if (!(in >> op)) continue;
    if (op == "new") {
      in >> threads >> times;
      c = std::make_unique<Race>(threads, times);
    } else if (op == "step") {
      int t;
      in >> t;
      t--;
      if (t >= threads)
        std::cout << "none\n";
      else if (c->step(t))
        std::cout << "count=" << c->count.load() << " r=" << c->reg[t] << "\n";
      else
        std::cout << "done\n";
    } else if (op == "run") {
      std::string sched;
      in >> sched;
      c = std::make_unique<Race>(threads, times);
      bool ok = true;
      for (char d : sched) {
        int t = d - '1';
        if (t < 0 || t >= threads || !c->step(t)) {
          ok = false;
          break;
        }
      }
      if (ok)
        std::cout << "count=" << c->count.load() << "\n";
      else
        std::cout << "stopped\n";
    } else if (op == "every") {
      bool first = true;
      for (const auto& [count, n] : outcomes(*c)) {
        std::cout << (first ? "" : " ") << count << ":" << n;
        first = false;
      }
      std::cout << "\n";
    } else if (op == "reset") {
      c = std::make_unique<Race>(threads, times);
      std::cout << "count=0\n";
    } else if (op == "threads") {
      std::cout << Race(threads, times).run_threads(true) << "\n";
    }
  }
}
