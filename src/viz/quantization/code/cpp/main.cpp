// Test driver: reads one operation per line, prints one line per result.
// "settings bits scheme group" sets the options and "load <24 numbers>" the 4 x 6 weights, row
// by row; neither prints. "quantize" prints the codes, a bar, the decoded weights (three
// decimals), a bar, and the total |error|.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "quantize.hpp"

static const int ROWS = 4, COLS = 6;

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

int main() {
    int bits = 8;
    std::string scheme = "absmax", group = "tensor";
    Matrix w(ROWS, std::vector<double>(COLS, 0.0));
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "settings") {
            in >> bits >> scheme >> group;
        } else if (op == "load") {
            for (auto& row : w)
                for (double& v : row) in >> v;
        } else if (op == "quantize") {
            std::vector<std::vector<int>> codes;
            Matrix decoded;
            quantize_matrix(w, bits, scheme, group, codes, decoded);
            std::string q, d;
            double total = 0;
            for (int r = 0; r < ROWS; r++)
                for (int c = 0; c < COLS; c++) {
                    q += (q.empty() ? "" : " ") + std::to_string(codes[r][c]);
                    d += (d.empty() ? "" : " ") + three(decoded[r][c]);
                    total += std::fabs(decoded[r][c] - w[r][c]);
                }
            std::cout << q << " | " << d << " | " << three(total) << "\n";
        }
    }
}
