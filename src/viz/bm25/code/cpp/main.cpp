// Test driver: reads one operation per line, prints one result per line.
// "add <words>" indexes a document (no output); "clear" starts again;
// "search <k1> <b> rsj|plus1 <words>" prints the best three as "d<id> <score>" pairs,
// best first, three decimals, or "none".
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "bm25.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

int main() {
    InvertedIndex idx;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "add") {
            std::vector<std::string> words;
            for (std::string w; in >> w;) words.push_back(w);
            idx.add(words);
        } else if (op == "clear") {
            idx = InvertedIndex();
        } else if (op == "search") {
            double k1, b;
            std::string idf;
            in >> k1 >> b >> idf;
            std::vector<std::string> query;
            for (std::string w; in >> w;) query.push_back(w);
            std::vector<Hit> top = idx.search(query, k1, b, idf);
            std::string out;
            for (const Hit& h : top) out += (out.empty() ? "d" : " d") + std::to_string(h.doc) + " " + three(h.score);
            std::cout << (top.empty() ? "none" : out) << "\n";
        }
    }
    return 0;
}
