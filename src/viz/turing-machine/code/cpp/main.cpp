// Test driver: reads one operation per line, prints one result per line.
//   load <rules>   loads a machine (prints nothing)
//   run <word>     prints "accept after 25 moves: xxxyyy", or reject, or still running
#include <iostream>
#include <memory>
#include <string>

#include "turing_machine.hpp"

int main() {
  std::unique_ptr<TuringMachine> machine;
  std::string line;
  while (std::getline(std::cin, line)) {
    auto space = line.find(' ');
    std::string op = line.substr(0, space);
    std::string arg = space == std::string::npos ? "" : line.substr(space + 1);
    if (op == "load") {
      machine = std::make_unique<TuringMachine>(arg);
    } else if (op == "run") {
      arg.erase(arg.find_last_not_of(" \r") + 1);
      TuringMachine::Result r = machine->run(arg);
      std::string verdict = r.verdict == "running" ? "still running" : r.verdict;
      std::cout << verdict << " after " << r.moves << (r.moves == 1 ? " move: " : " moves: ")
                << r.tape << "\n";
    }
  }
  return 0;
}
