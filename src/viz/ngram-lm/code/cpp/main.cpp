// Test driver: reads one operation per line, prints one result per line.
// "model n k" starts a model and "train <words>" adds a sentence (no output). "count" prints
// the n-grams counted and how many differ; "counts <context>" the tokens seen after it with
// their counts; "next <context>" every token with a probability above 0; "generate u1 u2 ..."
// the tokens drawn; "score <words>" the perplexity, or inf.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "ngram.hpp"

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
    NgramModel model;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, w;
        if (!(in >> op)) continue;
        std::vector<std::string> rest;
        while (in >> w) rest.push_back(w);
        if (op == "model") {
            model = NgramModel(std::stoi(rest[0]), std::stod(rest[1]));
        } else if (op == "train") {
            model.train(rest);
        } else if (op == "count") {
            int tokens = 0, distinct = 0;
            for (const auto& [c, t] : model.totals) tokens += t;
            for (const auto& [c, row] : model.counts) distinct += static_cast<int>(row.size());
            std::cout << tokens << " " << distinct << "\n";
        } else if (op == "counts") {
            std::vector<std::pair<std::string, int>> seen;
            auto row = model.counts.find(joined(rest));
            if (row != model.counts.end()) seen.assign(row->second.begin(), row->second.end());
            std::stable_sort(seen.begin(), seen.end(),
                             [](const auto& a, const auto& b) { return a.second > b.second; });
            std::string out;
            for (const auto& [word, c] : seen)
                out += (out.empty() ? "" : " ") + word + " " + std::to_string(c);
            std::cout << (out.empty() ? "none" : out) << "\n";
        } else if (op == "next") {
            std::string out;
            for (const auto& [word, p] : model.next_words(rest))
                out += (out.empty() ? "" : " ") + word + " " + three(p);
            std::cout << (out.empty() ? "none" : out) << "\n";
        } else if (op == "generate") {
            std::vector<double> us;
            for (const std::string& u : rest) us.push_back(std::stod(u));
            std::cout << joined(model.generate(us)) << "\n";
        } else if (op == "score") {
            double pp = model.perplexity(rest);
            std::cout << (std::isinf(pp) ? "inf" : three(pp)) << "\n";
        }
    }
}
