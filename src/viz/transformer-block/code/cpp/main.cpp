// Test driver: reads one operation per line, prints one result per line.
// "w <name> rows cols <values>" sets a weight matrix and "b <name> <values>" a bias;
// "vocab <words>" names the unembedding's columns; "clear" starts a sentence and
// "x <numbers>" adds a word's vector. None of these print. "run <pre|post> <layer|rms>
// <relu|gelu|swiglu>" prints the last word's attention weights, x1, x2 and the logits,
// three decimals each, and the guess, separated by bars.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "block.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string row(const Vec& v) {
    std::string out;
    for (size_t i = 0; i < v.size(); i++) out += (i ? " " : "") + three(v[i]);
    return out;
}

int main() {
    Weights w;
    Matrix x;
    std::vector<std::string> vocab;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "w") {
            std::string name;
            size_t r, c;
            in >> name >> r >> c;
            Matrix m(r, Vec(c));
            for (auto& rw : m)
                for (double& v : rw) in >> v;
            w[name] = m;
        } else if (op == "b") {
            std::string name;
            in >> name;
            Vec b;
            double v;
            while (in >> v) b.push_back(v);
            w[name] = Matrix{b};
        } else if (op == "vocab") {
            vocab.clear();
            std::string word;
            while (in >> word) vocab.push_back(word);
        } else if (op == "clear") {
            x.clear();
        } else if (op == "x") {
            Vec rw;
            double v;
            while (in >> v) rw.push_back(v);
            x.push_back(rw);
        } else if (op == "run") {
            std::string order, kind, act;
            in >> order >> kind >> act;
            BlockResult r = block(x, w, order, kind, act);
            double top = *std::max_element(r.logits.begin(), r.logits.end());
            size_t guess = 0;
            while (r.logits[guess] < top - 1e-9) guess++;
            std::cout << row(r.a) << " | " << row(r.x1) << " | " << row(r.x2) << " | "
                      << row(r.logits) << " | " << vocab[guess] << "\n";
        }
    }
}
