// Test driver: reads one operation per line, prints one result per line.
// "logits <word> <logit> ..." sets the logits. "softmax T" prints every word with its
// probability, most likely first. "sample strategy T k p ratio u" prints the kept words with
// their renormalized probabilities, a bar, and the word drawn.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "sampling.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

int main() {
    std::vector<std::string> words;
    std::vector<double> logits;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "logits") {
            words.clear();
            logits.clear();
            std::string w;
            double l;
            while (in >> w >> l) {
                words.push_back(w);
                logits.push_back(l);
            }
        } else if (op == "softmax") {
            double t;
            in >> t;
            std::vector<double> p = softmax(logits, t);
            std::string out;
            for (size_t i : most_likely_first(p))
                out += (out.empty() ? "" : " ") + words[i] + " " + three(p[i]);
            std::cout << out << "\n";
        } else if (op == "sample") {
            std::string strategy;
            double t, top_p, min_p, u;
            size_t k;
            in >> strategy >> t >> k >> top_p >> min_p >> u;
            std::vector<double> p = softmax(logits, t);
            std::vector<size_t> kept = cut(p, strategy, k, top_p, min_p);
            std::vector<double> q = renormalize(p, kept);
            size_t chosen = draw(q, kept, u);
            std::string out;
            for (size_t i : kept) out += (out.empty() ? "" : " ") + words[i] + " " + three(q[i]);
            std::cout << out << " | " << words[chosen] << "\n";
        }
    }
}
