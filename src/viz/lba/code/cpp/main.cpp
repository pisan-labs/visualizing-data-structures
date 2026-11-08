// Test driver: reads one operation per line, prints one result per line.
//   machine anbncn | power2 | double   which machine runs
//   run aabbcc                         prints "accept 23", "reject 4" or "blocked 3"
#include <iostream>

#include "lba.hpp"

int main() {
    const Lba* m = &ANBNCN;
    for (std::string line; std::getline(std::cin, line);) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op >> arg;
        if (op == "machine") m = arg == "power2" ? &POWER2 : arg == "double" ? &DOUBLE : &ANBNCN;
        else if (op == "run") std::cout << m->run(arg == "eps" ? "" : arg, 1000) << "\n";
    }
}
