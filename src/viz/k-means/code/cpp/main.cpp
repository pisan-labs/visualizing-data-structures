// Test driver: reads one operation per line, prints one result per line.
// "points x y x y ..." and "place x y ..." set the points and the centres (no output).
// "seed plus|random k u1 ... uk" prints the indices of the points chosen as centres.
// "assign" prints the labels and WCSS; "update farthest|stay" the centres and WCSS;
// "run farthest|stay" the rounds, the labels, the centres and WCSS. Three decimals.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

#include "kmeans.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::vector<Point> pairs(std::istringstream& in) {
    std::vector<Point> out;
    double x, y;
    while (in >> x >> y) out.push_back({x, y});
    return out;
}

static std::string show(const std::vector<Point>& centres) {
    std::string out;
    for (size_t i = 0; i < centres.size(); i++)
        out += (i ? " / " : "") + three(centres[i].x) + " " + three(centres[i].y);
    return out;
}

static std::string join(const std::vector<int>& xs) {
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + std::to_string(xs[i]);
    return out;
}

int main() {
    std::vector<Point> points, centres;
    std::vector<int> labels;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "points") {
            points = pairs(in);
            centres.clear();
            labels.clear();
        } else if (op == "place") {
            centres = pairs(in);
            labels.clear();
        } else if (op == "seed") {
            std::string mode;
            int k;
            in >> mode >> k;
            std::vector<double> draws(k);
            for (double& u : draws) in >> u;
            size_t next = 0;
            auto rand = [&]() { return draws[next++]; };
            std::vector<int> chosen = mode == "plus" ? kmeansPP(points, k, rand) : randomSeeds(points, k, rand);
            centres.clear();
            for (int i : chosen) centres.push_back(points[i]);
            labels.clear();
            std::cout << join(chosen) << "\n";
        } else if (op == "assign") {
            labels = assign(points, centres);
            std::cout << join(labels) << " | " << three(wcss(points, labels, centres)) << "\n";
        } else if (op == "update") {
            std::string empty;
            in >> empty;
            centres = update(points, labels, centres, empty);
            std::cout << show(centres) << " | " << three(wcss(points, labels, centres)) << "\n";
        } else if (op == "run") {
            std::string empty;
            in >> empty;
            Result r = lloyd(points, centres, labels, empty);
            centres = r.centres;
            labels = r.labels;
            std::cout << r.rounds << " | " << join(labels) << " | " << show(centres) << " | "
                      << three(wcss(points, labels, centres)) << "\n";
        }
    }
    return 0;
}
