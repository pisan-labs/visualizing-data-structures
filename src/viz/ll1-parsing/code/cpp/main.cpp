// Test driver: reads one operation per line, prints one result per line.
//   policy refuse | first        parse with conflicts: refuse, or take the first rule
//   load E -> T X; X -> + T X; X -> eps     one rule per item, symbols spaced
//   first / follow               prints "E: ( a; X: + eps; ..." (sorted, variables in order)
//   table                        prints "conflicts N"
//   parse a+a                    prints "accept 9", "reject 4", "gave-up 40" or "refuse"
#include <algorithm>
#include <iostream>
#include <memory>
#include <sstream>

#include "ll1.hpp"

static std::vector<std::string> variables;

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
    variables = {rules[0].first};
    auto add = [](const std::string& s) {
        if (isVar(s) && std::find(variables.begin(), variables.end(), s) == variables.end()) variables.push_back(s);
    };
    for (auto& [h, b] : rules) add(h);
    for (auto& [h, b] : rules)
        for (auto& s : b) add(s);
    return rules;
}

static std::string show(std::map<std::string, Set>& sets) {
    std::string out;
    for (auto& v : variables) {
        out += (out.empty() ? "" : "; ") + v + ":";
        for (auto& x : sets[v]) out += " " + x;
    }
    return out;
}

int main() {
    bool refuse = true;
    std::unique_ptr<Ll1> p;
    for (std::string line; std::getline(std::cin, line);) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op;
        std::getline(in >> std::ws, arg);
        if (op == "policy") refuse = arg == "refuse";
        else if (op == "load") p = std::make_unique<Ll1>(load(arg), variables);
        else if (op == "first") std::cout << show(p->first) << "\n";
        else if (op == "follow") std::cout << show(p->follow) << "\n";
        else if (op == "table") std::cout << "conflicts " << p->conflicts() << "\n";
        else if (op == "parse")
            std::cout << (refuse && p->conflicts() > 0 ? "refuse" : p->parse(arg == "eps" ? "" : arg, 40)) << "\n";
    }
}
