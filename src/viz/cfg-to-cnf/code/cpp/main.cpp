// Test driver: reads one operation per line, prints one result per line.
//   order bin-first                          BIN before TERM from now on (Sipser)
//   convert S -> A S A | a B; B -> b | eps   prints the grammar in CNF, symbols spaced
#include <iostream>
#include <sstream>

#include "cnf.hpp"

static std::vector<std::string> splitOn(const std::string& s, const std::string& sep) {
    std::vector<std::string> out;
    size_t from = 0;
    for (size_t at; (at = s.find(sep, from)) != std::string::npos; from = at + sep.size())
        out.push_back(s.substr(from, at - from));
    out.push_back(s.substr(from));
    return out;
}

static std::vector<Rule> parse(const std::string& text) {
    std::vector<Rule> rules;
    for (auto& item : splitOn(text, ";")) {
        auto sides = splitOn(item, "->");
        std::istringstream h(sides[0]);
        std::string head;
        h >> head;
        for (auto& alt : splitOn(sides[1], "|")) {
            std::istringstream in(alt);
            Body body;
            for (std::string s; in >> s;) body.push_back(s);
            if (body == Body{"eps"}) body.clear();
            Rule r = {head, body};
            if (std::find(rules.begin(), rules.end(), r) == rules.end()) rules.push_back(r);
        }
    }
    return rules;
}

static std::string show(const std::vector<Rule>& rules) {
    std::vector<std::string> heads;
    for (auto& [h, b] : rules)
        if (std::find(heads.begin(), heads.end(), h) == heads.end()) heads.push_back(h);
    std::string out;
    for (auto& h : heads) {
        out += (out.empty() ? "" : "; ") + h + " ->";
        bool first = true;
        for (auto& [g, b] : rules) {
            if (g != h) continue;
            out += first ? " " : " | ";
            first = false;
            std::string alt;
            for (auto& s : b) alt += (alt.empty() ? "" : " ") + s;
            out += alt.empty() ? "eps" : alt;
        }
    }
    return out;
}

int main() {
    bool termFirst = true;
    for (std::string line; std::getline(std::cin, line);) {
        std::istringstream in(line);
        std::string op, rest;
        in >> op;
        std::getline(in, rest);
        if (op == "order") termFirst = rest.find("term-first") != std::string::npos;
        else if (op == "convert") std::cout << show(Cnf().convert(parse(rest), termFirst)) << "\n";
    }
}
