// Test driver: reads one operation per line, prints one result per line.
// "w q|k|v|o rows cols <values>" sets a weight matrix and "heads h h_kv" the heads; "clear"
// starts a sentence and "x <numbers>" adds a word's embedding. None of these print.
// "attend" prints each head's weights, then O, separated by bars, rows by slashes, three
// decimals each.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

#include "multihead.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string rows(const Matrix& m) {
    std::string out;
    for (size_t i = 0; i < m.size(); i++) {
        if (i) out += " / ";
        for (size_t j = 0; j < m[i].size(); j++) out += (j ? " " : "") + three(m[i][j]);
    }
    return out;
}

int main() {
    std::map<std::string, Matrix> w;
    Matrix x;
    size_t h = 1, h_kv = 1;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "w") {
            std::string name;
            size_t r, c;
            in >> name >> r >> c;
            Matrix m(r, std::vector<double>(c));
            for (auto& row : m)
                for (double& v : row) in >> v;
            w[name] = m;
        } else if (op == "heads") {
            in >> h >> h_kv;
        } else if (op == "clear") {
            x.clear();
        } else if (op == "x") {
            std::vector<double> row;
            double v;
            while (in >> v) row.push_back(v);
            x.push_back(row);
        } else if (op == "attend") {
            MultiHeadResult r = multi_head_attention(x, w["q"], w["k"], w["v"], w["o"], h, h_kv);
            std::string out;
            for (const Matrix& a : r.a) out += rows(a) + " | ";
            std::cout << out << rows(r.o) << "\n";
        }
    }
}
