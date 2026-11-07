// Test driver: reads one move per line, prints one result per line.
//   adversary <lemma> <lang> <p> <s>        -> splits <n> survive <k> pick <lengths>
//   pump <lemma> <lang> <s> <lengths> <i>   -> <pumped string or eps> in|out
//   prover <lemma> <lang> <s> <lengths>     -> i <i> | none
#include <iostream>
#include <sstream>

#include "pumping.hpp"

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, lemma, lang;
        if (!(in >> op >> lemma >> lang)) continue;
        bool regular = lemma == "regular";
        if (op == "adversary") {
            int p;
            std::string s;
            in >> p >> s;
            Search r = adversary(lang, s, p, regular);
            std::cout << "splits " << r.count << " survive " << r.survivors << " pick";
            for (int k : r.pick) std::cout << ' ' << k;
            std::cout << '\n';
            continue;
        }
        std::string s;
        in >> s;
        Parts nums;
        for (int k; in >> k;) nums.push_back(k);
        if (op == "pump") {
            int i = nums.back();
            nums.pop_back();
            std::string w = pump(s, nums, i, regular);
            std::cout << (w.empty() ? "eps" : w) << (member(lang, w) ? " in" : " out") << '\n';
        } else if (op == "prover") {
            auto i = prover(lang, s, nums, regular);
            std::cout << (i ? "i " + std::to_string(*i) : "none") << '\n';
        }
    }
}
