// Test driver: reads one operation per line, prints one result per line.
// "clear" starts a sentence and "x q1 q2 k1 k2" adds a word's query and key; neither prints.
// "encode sinusoidal|rope|alibi" prints the encodings, the angles or the biases (ALiBi: each
// row up to the diagonal); "score sinusoidal|rope|alibi" prints PE(m)·PE(n), the turned
// q_m·k_n, or ALiBi's attention weights. Rows are separated by slashes, three decimals each.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "positions.hpp"

constexpr int D = 8;  // four pairs
constexpr double SLOPE = 0.5;

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
    Matrix q, k;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op, scheme;
        if (!(in >> op)) continue;
        int n = static_cast<int>(q.size());
        if (op == "clear") {
            q.clear();
            k.clear();
        } else if (op == "x") {
            double q1, q2, k1, k2;
            in >> q1 >> q2 >> k1 >> k2;
            q.push_back({q1, q2});
            k.push_back({k1, k2});
        } else if (op == "encode") {
            in >> scheme;
            Matrix t;
            if (scheme == "sinusoidal") {
                t = sinusoidal(n, D);
            } else {
                for (int i = 0; i < n; i++) {
                    std::vector<double> row;
                    for (int j = 0; j < (scheme == "rope" ? D / 2 : i + 1); j++)
                        row.push_back(scheme == "rope" ? angle(i, j, D) : -SLOPE * (i - j));
                    t.push_back(row);
                }
            }
            std::cout << rows(t) << "\n";
        } else if (op == "score") {
            in >> scheme;
            Matrix s;
            if (scheme == "sinusoidal") {
                Matrix pe = sinusoidal(n, D);
                for (const auto& a : pe) {
                    std::vector<double> row;
                    for (const auto& b : pe) row.push_back(dot(a, b));
                    s.push_back(row);
                }
            } else if (scheme == "rope") {
                Matrix qs, ks;  // the same pair in each of the four pairs
                for (int i = 0; i < n; i++) {
                    qs.emplace_back();
                    ks.emplace_back();
                    for (int t = 0; t < D / 2; t++) {
                        qs.back().insert(qs.back().end(), q[i].begin(), q[i].end());
                        ks.back().insert(ks.back().end(), k[i].begin(), k[i].end());
                    }
                }
                s = rope_scores(qs, ks);
            } else {
                s = alibi_attention(q, k, SLOPE);
            }
            std::cout << rows(s) << "\n";
        }
    }
}
