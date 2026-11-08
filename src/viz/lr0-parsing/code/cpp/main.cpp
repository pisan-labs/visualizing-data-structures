// Test driver: reads one operation per line, prints one result per line.
//   method lr0 | slr1                 where reduces go in the table
//   load E -> E + T; E -> T; T -> a   one rule per item, symbols spaced (Start -> S is added)
//   table                             prints "states N conflicts K"
//   parse a+a                         prints "accept 7", "reject 3" or "refuse" (conflicts)
#include <iostream>
#include <memory>
#include <sstream>

#include "lr0.hpp"

static std::vector<Rule> load(const std::string& text) {
    std::vector<Rule> rules;
    std::stringstream items(text);
    for (std::string item; std::getline(items, item, ';');) {
        auto arrow = item.find("->");
        std::istringstream h(item.substr(0, arrow)), in(item.substr(arrow + 2));
        Rule r;
        h >> r.first;
        for (std::string s; in >> s;) r.second.push_back(s);
        if (r.second == Body{"eps"}) r.second.clear();
        if (std::find(rules.begin(), rules.end(), r) == rules.end()) rules.push_back(r);
    }
    rules.insert(rules.begin(), Rule{"Start", {rules[0].first}});
    return rules;
}

int main() {
    bool slr = false;
    std::unique_ptr<Lr0> p;
    for (std::string line; std::getline(std::cin, line);) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op;
        std::getline(in >> std::ws, arg);
        if (op == "method") slr = arg == "slr1";
        else if (op == "load") {
            auto rules = load(arg);
            Sets follow = followSets(rules);
            p = std::make_unique<Lr0>(rules, slr ? &follow : nullptr);
        } else if (op == "table")
            std::cout << "states " << p->sets.size() << " conflicts " << p->conflicts() << "\n";
        else if (op == "parse")
            std::cout << (p->conflicts() > 0 ? "refuse" : p->parse(arg == "eps" ? "" : arg, 200)) << "\n";
    }
}
