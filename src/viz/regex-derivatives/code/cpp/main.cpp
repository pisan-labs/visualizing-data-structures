// Test driver: reads one operation per line, prints one result per line.
//   regex <prefix form>   reads an expression, such as ". * | a b a" for (a|b)*a (prints nothing)
//   derive <c>            prints the derivative by c
//   match <word>          prints "accept" or "reject" (eps is the empty word)
//   dfa                   prints "<k> states, <j> accepting", or "more than 8 states"
#include <iostream>
#include <sstream>
#include <string>

#include "derivatives.hpp"

R parse(std::istringstream& in) {
    std::string t;
    in >> t;
    if (t == "|" || t == ".") {
        R a = parse(in);
        R b = parse(in);
        return make(t[0], a, b);
    }
    if (t == "*" || t == "+" || t == "?") return make(t[0], parse(in));
    if (t == "eps") return EPS;
    if (t == "empty") return EMPTY;
    return make('s', nullptr, nullptr, t[0]);
}

int main() {
    R r = EMPTY;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, arg;
        in >> op;
        if (op == "regex") {
            r = parse(in);
        } else if (op == "derive") {
            in >> arg;
            std::cout << show(derive(r, arg[0])) << '\n';
        } else if (op == "match") {
            in >> arg;
            std::cout << (matches(r, arg == "eps" ? "" : arg) ? "accept" : "reject") << '\n';
        } else if (op == "dfa") {
            auto d = dfa(r);
            if (d) std::cout << d->first << " states, " << d->second << " accepting\n";
            else std::cout << "more than 8 states\n";
        }
    }
}
