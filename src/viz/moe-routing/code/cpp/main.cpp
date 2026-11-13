// Test driver: reads one operation per line, prints one result per line.
// "w rows cols <values>" sets the router; "clear" starts a sentence and "x <numbers>" adds a
// token. Neither prints. "route k cf token|expert" prints, for each token, its kept experts
// and weights ("2:0.818", "-" for none) separated by slashes; then the number of dropped
// assignments and of tokens with no expert; then the load-balance loss.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "moe.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

int main() {
    Matrix w, x;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "w") {
            size_t r, c;
            in >> r >> c;
            w.assign(r, Vec(c));
            for (auto& row : w)
                for (double& v : row) in >> v;
        } else if (op == "clear") {
            x.clear();
        } else if (op == "x") {
            Vec row;
            double v;
            while (in >> v) row.push_back(v);
            x.push_back(row);
        } else if (op == "route") {
            int k;
            double cf;
            std::string routing;
            in >> k >> cf >> routing;
            Routed r = route(x, w, k, cf, routing);
            int dropped = 0, orphans = 0;
            for (const auto& a : r.assignments)
                if (!a.kept) dropped++;
            std::string per;
            for (int t = 0; t < static_cast<int>(x.size()); t++) {
                std::string kept;
                for (int e = 0; e < static_cast<int>(w[0].size()); e++)
                    for (const auto& a : r.assignments)
                        if (a.token == t && a.expert == e && a.kept)
                            kept += (kept.empty() ? "" : ",") + std::to_string(e + 1) + ":" +
                                    three(a.weight);
                if (kept.empty()) {
                    kept = "-";
                    orphans++;
                }
                per += (t ? " / " : "") + kept;
            }
            std::cout << per << " | " << dropped << " " << orphans << " | " << three(r.loss)
                      << "\n";
        }
    }
}
