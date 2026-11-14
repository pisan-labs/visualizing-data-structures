// Test driver: reads one operation per line, prints one result per line.
// "count word n" adds a word and its count; "noise" prints the noise distribution.
// "w word x y" and "c word x y" set a word's vectors. "pairs L words..." prints the pairs as
// center:context. "update lr k center context u..." draws k noise words with the u's,
// updates, and prints the noise words | the sigmoids | new w | new c.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "word2vec.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string vec(const std::vector<double>& v) {
    std::string out;
    for (size_t i = 0; i < v.size(); i++) out += (i ? " " : "") + three(v[i]);
    return out;
}

int main() {
    std::vector<std::pair<std::string, int>> counts;
    Noise noise;
    Vectors w, c;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "count") {
            std::string word;
            int n;
            in >> word >> n;
            counts.emplace_back(word, n);
            noise = noise_distribution(counts);
        } else if (op == "noise") {
            std::string out;
            for (size_t i = 0; i < noise.size(); i++) out += (i ? " " : "") + three(noise[i].second);
            std::cout << out << "\n";
        } else if (op == "w" || op == "c") {
            std::string word;
            double x, y;
            in >> word >> x >> y;
            (op == "w" ? w : c)[word] = {x, y};
        } else if (op == "pairs") {
            int window;
            in >> window;
            std::vector<std::string> words;
            std::string t;
            while (in >> t) words.push_back(t);
            std::string out;
            for (const auto& [a, b] : pairs(words, window)) out += (out.empty() ? "" : " ") + a + ":" + b;
            std::cout << (out.empty() ? "-" : out) << "\n";
        } else if (op == "update") {
            double lr;
            int k;
            std::string center, context;
            in >> lr >> k >> center >> context;
            std::vector<std::string> negs = negatives(noise, k, center, context, [&in] {
                double u;
                in >> u;
                return u;
            });
            std::vector<double> sigmas = update(w, c, center, context, negs, lr);
            std::string names;
            for (const auto& n : negs) names += (names.empty() ? "" : " ") + n;
            std::cout << (names.empty() ? "-" : names) << " | " << vec(sigmas) << " | "
                      << vec(w[center]) << " | " << vec(c[context]) << "\n";
        }
    }
}
