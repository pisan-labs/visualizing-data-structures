// Test driver: reads one operation per line, prints one result per line.
// "clear" starts a sentence and "qkv q1 q2 k1 k2 v1 v2" adds a word's query, key and value.
// "flash kv|q br bc causal" and "plain causal" (1 or 0) print the rows of O, then m, then l,
// three decimals each, then the numbers moved: Q, K and V, O m l, the table.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "flash_attention.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string nums(const std::vector<double>& xs) {
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + three(xs[i]);
    return out;
}

static std::string line(const Result& r) {
    std::string out;
    for (size_t i = 0; i < r.o.size(); i++) out += (i ? " / " : "") + nums(r.o[i]);
    out += " | " + nums(r.m) + " | " + nums(r.l) + " |";
    for (long x : r.moved) out += " " + std::to_string(x);
    return out;
}

int main() {
    Matrix q, k, v;
    std::string text;
    while (std::getline(std::cin, text)) {
        std::istringstream in(text);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "clear") {
            q.clear();
            k.clear();
            v.clear();
        } else if (op == "qkv") {
            double x[6];
            for (double& t : x) in >> t;
            q.push_back({x[0], x[1]});
            k.push_back({x[2], x[3]});
            v.push_back({x[4], x[5]});
        } else if (op == "flash") {
            std::string order;
            size_t br, bc;
            int causal;
            in >> order >> br >> bc >> causal;
            std::cout << line(flash_attention(q, k, v, br, bc, causal == 1, order == "q")) << "\n";
        } else if (op == "plain") {
            int causal;
            in >> causal;
            std::cout << line(attention(q, k, v, causal == 1)) << "\n";
        }
    }
}
