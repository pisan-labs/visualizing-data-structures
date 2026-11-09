// Test driver: reads one operation per line, prints one result per line.
//   load <rules>   loads a machine such as 1RB1LB_1LA1RH on a blank tape (prints nothing)
//   reset          a blank tape again (prints nothing)
//   run <k>        makes up to k moves; prints "<state> <moves> <ones>"
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "busy_beaver.hpp"

int main() {
    std::unique_ptr<BusyBeaver> machine;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op >> arg;
        if (op == "load") {
            machine = std::make_unique<BusyBeaver>(arg);
        } else if (op == "reset") {
            machine->reset();
        } else if (op == "run") {
            machine->run(std::stol(arg));
            std::cout << machine->state() << ' ' << machine->moves() << ' ' << machine->ones() << '\n';
        }
    }
}
