// Test driver: one command per line, one line of output per command.
//   run <program> <input>               accept <steps> | reject <steps> | loop <first> <again>
//   diagonal <atm|halt> <p1> ... <pn>   D: <D's entry for each program>
//   reduce <atm|halt> <program> <input> S: accept|reject, or R: halts|loops
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "halting.hpp"

int main() {
  std::string text;
  while (std::getline(std::cin, text)) {
    std::istringstream in(text);
    std::string cmd;
    if (!(in >> cmd)) continue;
    if (cmd == "run") {
      std::string program, word;
      in >> program >> word;
      std::cout << run(program, word).str() << "\n";
    } else if (cmd == "diagonal") {
      std::string problem, code;
      in >> problem;
      std::vector<std::string> codes;
      while (in >> code) codes.push_back(code);
      std::cout << "D:";
      for (const std::string& d : dRow(codes, problem)) std::cout << " " << d;
      std::cout << "\n";
    } else if (cmd == "reduce") {
      std::string problem, program, word;
      in >> problem >> program >> word;
      if (problem == "atm")
        std::cout << "S: " << sDecidesAtm(program, word) << "\n";
      else
        std::cout << "R: " << rDecidesHalt(program, word) << "\n";
    }
  }
  return 0;
}
