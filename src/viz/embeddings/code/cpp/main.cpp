// Test driver: reads one operation per line, prints one result per line.
// "word w x y" adds a word and "normalize" scales every vector to length 1; neither prints.
// "sim a b" prints the dot product and the cosine. "nearest cosine|dot k w" prints the k
// nearest words with their scores; "analogy cosine|dot k a b c" prints a - b + c, a bar, and
// the k nearest other words. Numbers have three decimals.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

#include "embeddings.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string ranked(const std::vector<Scored>& best) {
    std::string out;
    for (size_t i = 0; i < best.size(); i++)
        out += (i ? " " : "") + best[i].word + " " + three(best[i].score);
    return out;
}

static Vec find(const std::vector<Word>& words, const std::string& w) {
    for (const Word& x : words)
        if (x.word == w) return x.v;
    throw std::invalid_argument("unknown word " + w);
}

int main() {
    std::vector<Word> words;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "word") {
            Word w;
            in >> w.word >> w.v.first >> w.v.second;
            words.push_back(w);
        } else if (op == "normalize") {
            for (Word& w : words) w.v = normalize(w.v);
        } else if (op == "sim") {
            std::string a, b;
            in >> a >> b;
            Vec va = find(words, a), vb = find(words, b);
            std::cout << three(dot(va, vb)) << " " << three(cosine(va, vb)) << "\n";
        } else if (op == "nearest") {
            std::string measure, w;
            size_t k;
            in >> measure >> k >> w;
            std::cout << ranked(nearest(words, find(words, w), k, measure == "cosine", {w}))
                      << "\n";
        } else if (op == "analogy") {
            std::string measure, a, b, c;
            size_t k;
            in >> measure >> k >> a >> b >> c;
            Vec t = analogy(find(words, a), find(words, b), find(words, c));
            std::cout << three(t.first) << " " << three(t.second) << " | "
                      << ranked(nearest(words, t, k, measure == "cosine", {a, b, c})) << "\n";
        }
    }
}
