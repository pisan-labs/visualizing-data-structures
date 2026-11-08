// Test driver: reads one operation per line, prints one result per line.
//   property accepts-A | accepts-eps | nonempty   choose P (and its M_P)
//   build 3 2      M' from M3 and w = <M2> (programs numbered from 1)
//   test AG        prints what M' does on the input: accept, reject or loop
//   decide         prints whether M' has P: yes or no (it does exactly when M halts on w)
#include <iostream>
#include <map>
#include <sstream>

#include "rice.hpp"

int main() {
    const std::vector<std::string> programs = {"A", "G1", "E6>E3>G1A", "?A5?G4RG4A", "?R7E5>G1<G1A", "E4>G1<?A7RA"};
    // For each property: M_P, and a word whose acceptance decides P for M'.
    const std::map<std::string, std::pair<std::string, std::string>> properties = {
        {"accepts-A", {"A", "A"}}, {"accepts-eps", {"E3RA", ""}}, {"nonempty", {"?A3RA", "A"}}};
    auto prop = properties.at("accepts-A");
    std::function<std::string(const std::string&)> machine;
    for (std::string line; std::getline(std::cin, line);) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op;
        if (op == "property") {
            in >> arg;
            prop = properties.at(arg);
        } else if (op == "build") {
            int i, j;
            in >> i >> j;
            machine = mPrime(programs[i - 1], programs[j - 1], prop.first);
        } else if (op == "test") {
            in >> arg;
            std::cout << machine(arg == "eps" ? "" : arg) << "\n";
        } else if (op == "decide") {
            std::cout << (hasProperty(machine, prop.second) ? "yes" : "no") << "\n";
        }
    }
}
