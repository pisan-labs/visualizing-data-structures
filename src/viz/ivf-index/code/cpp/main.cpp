// Test driver: reads one operation per line, prints one result per line.
// "points x y x y ..." sets the points (no output). "train i1 ... ik" runs k-means from the
// points k-means++ chose and prints the centres and the lists ("-" for an empty list).
// "search x y k nprobe" prints the indices found and the distances computed. Three decimals.
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>

#include "ivf.hpp"

static std::string three(double x) {
    long long k = static_cast<long long>(std::floor(std::fabs(x) * 1000 + 0.5));
    char buf[48];
    std::snprintf(buf, sizeof buf, "%s%lld.%03lld", x < 0 && k > 0 ? "-" : "", k / 1000,
                  k % 1000);
    return buf;
}

static std::string ids(const std::vector<int>& xs) {
    if (xs.empty()) return "-";
    std::string out;
    for (size_t i = 0; i < xs.size(); i++) out += (i ? " " : "") + std::to_string(xs[i]);
    return out;
}

int main() {
    std::vector<Point> points;
    std::unique_ptr<Ivf> index;
    std::string line;
    while (std::getline(std::cin, line)) {
        std::istringstream in(line);
        std::string op;
        if (!(in >> op)) continue;
        if (op == "points") {
            points.clear();
            double x, y;
            while (in >> x >> y) points.push_back({x, y});
            index.reset();
        } else if (op == "train") {
            std::vector<Point> start;
            int i;
            while (in >> i) start.push_back(points[i]);
            std::vector<Point> centres = kmeans(points, start);
            index = std::make_unique<Ivf>(points, centres);
            std::string cs, ls;
            for (size_t j = 0; j < centres.size(); j++) {
                cs += (j ? " / " : "") + three(centres[j].x) + " " + three(centres[j].y);
                ls += (j ? " / " : "") + ids(index->lists[j]);
            }
            std::cout << cs << " | " << ls << "\n";
        } else if (op == "search") {
            double x, y;
            int k, nprobe;
            in >> x >> y >> k >> nprobe;
            auto [found, count] = index->search({x, y}, k, nprobe);
            std::cout << ids(found) << " | " << count << "\n";
        }
    }
}
