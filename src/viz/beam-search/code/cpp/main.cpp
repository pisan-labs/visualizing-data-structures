// Test driver: reads one operation per line, prints one result per line.
// "p <word> <next> <probability>" adds a row of the model. "search <start> <B> <norm 1|0>
// <shrink|refill> <max length>" prints the finished hypotheses in the order they finished, each
// with its log-probability, then "=>" and the best.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "beam.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string joined(const std::vector<std::string>& ws) {
    std::string s;
    for (size_t i = 0; i < ws.size(); i++) s += (i ? " " : "") + ws[i];
    return s;
}

int main() {
    Model model;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "p") {
            std::string w, next;
            double p;
            in >> w >> next >> p;
            model[w].push_back({next, p});
        } else if (op == "search") {
            std::string start, eos;
            size_t width;
            int norm, max_len;
            in >> start >> width >> norm >> eos >> max_len;
            std::vector<Hyp> finished = beam_search(model, start, width, eos, max_len);
            const Hyp* best = best_of(finished, norm == 1);
            std::string out;
            for (const Hyp& h : finished)
                out += (out.empty() ? "" : " | ") + joined(h.words) + " " + three(h.score);
            std::cout << out << " => " << (best ? joined(best->words) : "none") << "\n";
        }
    }
}
