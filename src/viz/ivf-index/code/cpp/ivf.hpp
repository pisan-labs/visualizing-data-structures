// An inverted file index (IVF) on points {x, y}: one list of points per k-means centre.
#pragma once
#include <algorithm>
#include <set>
#include <utility>
#include <vector>

struct Point {
    double x, y;
};

inline double dist2(const Point& a, const Point& b) {
    double dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
}

// Index of the centre nearest to p; a tie goes to the lower index.
inline int nearest(const Point& p, const std::vector<Point>& centres) {
    int best = 0;
    for (int j = 1; j < static_cast<int>(centres.size()); j++)
        if (dist2(p, centres[j]) < dist2(p, centres[best])) best = j;
    return best;
}

// Each centre to the mean of its points; one with no points jumps to the farthest point.
inline std::vector<Point> moveCentres(const std::vector<Point>& points, const std::vector<int>& labels,
                                      const std::vector<Point>& centres) {
    std::vector<Point> next = centres;
    std::vector<int> empties;
    for (int j = 0; j < static_cast<int>(centres.size()); j++) {
        double sx = 0, sy = 0;
        int n = 0;
        for (size_t i = 0; i < points.size(); i++)
            if (labels[i] == j) {
                sx += points[i].x;
                sy += points[i].y;
                n++;
            }
        if (n == 0)
            empties.push_back(j);
        else
            next[j] = {sx / n, sy / n};
    }
    std::set<int> taken;
    for (int j : empties) {
        int far = -1;
        double farD = 0;
        for (int i = 0; i < static_cast<int>(points.size()); i++) {
            double d = dist2(points[i], next[labels[i]]);
            if (!taken.count(i) && d > farD) {
                far = i;
                farD = d;
            }
        }
        if (far >= 0) {
            taken.insert(far);
            next[j] = points[far];
        }
    }
    return next;
}

// Lloyd's algorithm from the starting centres (here, k-means++ picks them).
inline std::vector<Point> kmeans(const std::vector<Point>& points, std::vector<Point> centres,
                                 int maxRounds = 20) {
    std::vector<int> labels;
    for (int round = 0; round < maxRounds; round++) {
        std::vector<int> next;
        for (const Point& p : points) next.push_back(nearest(p, centres));
        if (next == labels) break;
        labels = next;
        centres = moveCentres(points, labels, centres);
    }
    return centres;
}

struct Ivf {
    std::vector<Point> points, centres;
    std::vector<std::vector<int>> lists;

    Ivf(std::vector<Point> pts, std::vector<Point> cs)
        : points(std::move(pts)), centres(std::move(cs)), lists(centres.size()) {
        for (int i = 0; i < static_cast<int>(points.size()); i++)
            lists[nearest(points[i], centres)].push_back(i);
    }

    // The k nearest points in the nprobe lists whose centres are nearest to q, and how many
    // distances that took.
    std::pair<std::vector<int>, int> search(const Point& q, int k, int nprobe) const {
        std::vector<std::pair<double, int>> d;
        for (int j = 0; j < static_cast<int>(centres.size()); j++) d.push_back({dist2(q, centres[j]), j});
        std::sort(d.begin(), d.end());
        int count = static_cast<int>(centres.size());
        std::vector<std::pair<double, int>> found;
        for (int r = 0; r < std::min(nprobe, static_cast<int>(d.size())); r++)
            for (int i : lists[d[r].second]) {
                found.push_back({dist2(q, points[i]), i});
                count++;
            }
        std::sort(found.begin(), found.end());
        std::vector<int> ids;
        for (int r = 0; r < std::min(k, static_cast<int>(found.size())); r++) ids.push_back(found[r].second);
        return {ids, count};
    }
};
