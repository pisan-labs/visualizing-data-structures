// Test driver: "merge s-f ..." prints the merged list; "insert x s-f ..." inserts x into the
// list; "intersect s-f ... | s-f ..." prints what two lists have in common. Each prints its
// intervals as s-f separated by spaces, or "none".
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "intervals.hpp"

Interval parse(const std::string& t) {
    auto dash = t.find('-');
    return {std::stoi(t.substr(0, dash)), std::stoi(t.substr(dash + 1))};
}

std::string show(const std::vector<Interval>& ivs) {
    if (ivs.empty()) return "none";
    std::string s;
    for (const auto& [a, b] : ivs) s += (s.empty() ? "" : " ") + std::to_string(a) + "-" + std::to_string(b);
    return s;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string cmd, t;
        if (!(in >> cmd)) continue;
        std::vector<Interval> a, b;
        bool second = false;
        while (in >> t) {
            if (t == "|") second = true;
            else (second ? b : a).push_back(parse(t));
        }
        if (cmd == "merge") {
            std::cout << show(merge(a)) << '\n';
        } else if (cmd == "insert") {
            Interval x = a.front();
            a.erase(a.begin());
            std::cout << show(insert(a, x)) << '\n';
        } else if (cmd == "intersect") {
            std::cout << show(intersect(a, b)) << '\n';
        }
    }
}
