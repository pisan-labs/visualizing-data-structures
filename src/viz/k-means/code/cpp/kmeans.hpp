// k-means with Lloyd's algorithm, on points {x, y}.
#pragma once
#include <algorithm>
#include <functional>
#include <set>
#include <string>
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

inline std::vector<int> assign(const std::vector<Point>& points, const std::vector<Point>& centres) {
    std::vector<int> labels;
    for (const Point& p : points) labels.push_back(nearest(p, centres));
    return labels;
}

// Move each centre to the mean of its points. A centre with no points jumps to the point
// farthest from its own centre ("farthest") or stays put ("stay").
inline std::vector<Point> update(const std::vector<Point>& points, const std::vector<int>& labels,
                                 const std::vector<Point>& centres, const std::string& empty) {
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
        if (empty != "farthest") continue;
        int far = -1;
        double farD = 0;
        for (int i = 0; i < static_cast<int>(points.size()); i++) {
            double d = dist2(points[i], next[labels[i]]);
            if (!taken.count(i) && d > farD) {
                far = i;
                farD = d;
            }
        }
        if (far >= 0) {  // if every point sits on its centre, stay put
            taken.insert(far);
            next[j] = points[far];
        }
    }
    return next;
}

// Within-cluster sum of squares: what Lloyd's algorithm makes smaller.
inline double wcss(const std::vector<Point>& points, const std::vector<int>& labels,
                   const std::vector<Point>& centres) {
    double total = 0;
    for (size_t i = 0; i < points.size(); i++) total += dist2(points[i], centres[labels[i]]);
    return total;
}

// k different points, each equally likely. rand() gives uniform numbers in [0, 1).
inline std::vector<int> randomSeeds(const std::vector<Point>& points, int k,
                                    const std::function<double()>& rand) {
    std::vector<int> pool;
    for (int i = 0; i < static_cast<int>(points.size()); i++) pool.push_back(i);
    std::vector<int> chosen;
    for (int c = 0; c < k; c++) {
        int at = static_cast<int>(rand() * pool.size());
        chosen.push_back(pool[at]);
        pool.erase(pool.begin() + at);
    }
    return chosen;
}

// k-means++ seeding (Arthur and Vassilvitskii 2007): after a uniform first centre, each point
// x is picked with probability D(x)^2 / (sum of all D^2).
inline std::vector<int> kmeansPP(const std::vector<Point>& points, int k,
                                 const std::function<double()>& rand) {
    int n = static_cast<int>(points.size());
    std::vector<int> chosen{static_cast<int>(rand() * n)};
    std::vector<double> d2;
    for (const Point& p : points) d2.push_back(dist2(p, points[chosen[0]]));
    while (static_cast<int>(chosen.size()) < k) {
        double u = rand();
        double total = 0;
        for (double x : d2) total += x;
        int pick = 0;
        if (total == 0) {  // every point sits on a centre: draw uniformly
            std::vector<int> pool;
            for (int i = 0; i < n; i++)
                if (std::find(chosen.begin(), chosen.end(), i) == chosen.end()) pool.push_back(i);
            pick = pool[static_cast<int>(u * pool.size())];
        } else {
            double target = u * total, run = 0;
            for (int i = 0; i < n; i++) {
                run += d2[i];
                if (run > target) {
                    pick = i;
                    break;
                }
            }
        }
        chosen.push_back(pick);
        for (int i = 0; i < n; i++) d2[i] = std::min(d2[i], dist2(points[i], points[pick]));
    }
    return chosen;
}

struct Result {
    std::vector<Point> centres;
    std::vector<int> labels;
    int rounds;
};

// Assign and update until an assignment changes nothing (labels may start empty).
inline Result lloyd(const std::vector<Point>& points, std::vector<Point> centres,
                    std::vector<int> labels, const std::string& empty, int maxRounds = 20) {
    for (int rounds = 1; rounds <= maxRounds; rounds++) {
        std::vector<int> next = assign(points, centres);
        if (next == labels) return {centres, labels, rounds};
        labels = next;
        centres = update(points, labels, centres, empty);
    }
    return {centres, labels, maxRounds};
}
