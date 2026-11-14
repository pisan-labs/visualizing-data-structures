// Test driver: "add x" adds a value; "median" prints the median (a whole number when it is
// one); "lower" prints the lower median; "clear" starts again.
#include <iostream>
#include <sstream>
#include <string>

#include "running_median.hpp"

int main() {
    RunningMedian rm;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "add") {
            int x;
            in >> x;
            rm.add(x);
        } else if (cmd == "median") {
            std::cout << rm.median() << "\n";  // 6.5, or 6 for a whole number
        } else if (cmd == "lower") {
            std::cout << rm.lowerMedian() << "\n";
        } else if (cmd == "clear") {
            rm = RunningMedian();
        }
    }
}
