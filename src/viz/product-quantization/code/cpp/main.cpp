// Test driver: reads one operation per line, prints one result per line.
// "vectors a b c d ..." sets the vectors (no output). "train m k u1 ..." trains m codebooks of
// k centres with those k-means++ draws and prints them. "encode" prints every vector's code.
// "search a b c d k" prints the distance to every vector by the table, then the k nearest by
// it. Three decimals.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "pq.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string ints(const std::vector<int>& xs) {
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + std::to_string(xs[i]);
    return out;
}

int main() {
    std::vector<Vec> vectors;
    PQ pq(1, 1);
    std::vector<std::vector<int>> codes;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "vectors") {
            vectors.clear();
            Vec v(4);
            while (in >> v[0] >> v[1] >> v[2] >> v[3]) vectors.push_back(v);
        } else if (op == "train") {
            int m, k;
            in >> m >> k;
            std::vector<double> draws;
            double u;
            while (in >> u) draws.push_back(u);
            pq = PQ(m, k);
            pq.train(vectors, draws);
            std::string out;
            for (int j = 0; j < m; j++) {
                if (j) out += " | ";
                for (int c = 0; c < k; c++) {
                    if (c) out += " / ";
                    for (size_t i = 0; i < pq.books[j][c].size(); i++)
                        out += (i ? " " : "") + three(pq.books[j][c][i]);
                }
            }
            std::cout << out << "\n";
        } else if (op == "encode") {
            codes.clear();
            std::string out;
            for (size_t i = 0; i < vectors.size(); i++) {
                codes.push_back(pq.encode(vectors[i]));
                out += (i ? " / " : "") + ints(codes.back());
            }
            std::cout << out << "\n";
        } else if (op == "search") {
            Vec q(4);
            int k;
            in >> q[0] >> q[1] >> q[2] >> q[3] >> k;
            std::vector<double> dists = pq.distances(q, codes);
            std::string out;
            for (size_t i = 0; i < dists.size(); i++) out += (i ? " " : "") + three(dists[i]);
            std::cout << out << " | " << ints(nearestK(dists, k)) << "\n";
        }
    }
}
