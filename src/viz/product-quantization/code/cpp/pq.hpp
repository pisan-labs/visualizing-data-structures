// Product quantization: m codebooks of k centres, one per piece of the vector.
#pragma once
#include <algorithm>
#include <limits>
#include <set>
#include <utility>
#include <vector>

using Vec = std::vector<double>;

inline double dist2(const Vec& a, const Vec& b) {
    double total = 0;
    for (size_t i = 0; i < a.size(); i++) {
        double d = a[i] - b[i];
        total += d * d;
    }
    return total;
}

// Index of the centre nearest to p; a tie goes to the lower index.
inline int nearest(const Vec& p, const std::vector<Vec>& centres) {
    int best = 0;
    for (int j = 1; j < static_cast<int>(centres.size()); j++)
        if (dist2(p, centres[j]) < dist2(p, centres[best])) best = j;
    return best;
}

// k-means++ seeding, one uniform number in [0, 1) per centre.
inline std::vector<int> kmeansPP(const std::vector<Vec>& points, const std::vector<double>& draws) {
    int n = static_cast<int>(points.size());
    std::vector<int> chosen;
    for (double u : draws) {
        if (!chosen.empty()) {
            std::vector<double> d2(n, std::numeric_limits<double>::infinity());
            double total = 0;
            for (int i = 0; i < n; i++) {
                for (int j : chosen) d2[i] = std::min(d2[i], dist2(points[i], points[j]));
                total += d2[i];
            }
            if (total > 0) {
                double run = 0;
                for (int i = 0; i < n; i++) {
                    run += d2[i];
                    if (run > u * total) {
                        chosen.push_back(i);
                        break;
                    }
                }
                continue;
            }
        }
        std::vector<int> pool;
        for (int i = 0; i < n; i++)
            if (std::find(chosen.begin(), chosen.end(), i) == chosen.end()) pool.push_back(i);
        chosen.push_back(pool[static_cast<int>(u * pool.size())]);
    }
    return chosen;
}

// Each centre to the mean of its points; one with no points jumps to the farthest point.
inline std::vector<Vec> update(const std::vector<Vec>& points, const std::vector<int>& labels,
                               const std::vector<Vec>& centres) {
    std::vector<Vec> next = centres;
    std::vector<int> empties;
    for (int j = 0; j < static_cast<int>(centres.size()); j++) {
        Vec s(centres[j].size(), 0.0);
        int n = 0;
        for (size_t i = 0; i < points.size(); i++)
            if (labels[i] == j) {
                for (size_t c = 0; c < s.size(); c++) s[c] += points[i][c];
                n++;
            }
        if (n == 0) {
            empties.push_back(j);
            continue;
        }
        for (double& x : s) x /= n;
        next[j] = s;
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

// Lloyd's algorithm: assign, move, until no point changes cluster.
inline std::vector<Vec> kmeans(const std::vector<Vec>& points, std::vector<Vec> centres,
                               int maxRounds = 20) {
    std::vector<int> labels;
    for (int round = 0; round < maxRounds; round++) {
        std::vector<int> next;
        for (const Vec& p : points) next.push_back(nearest(p, centres));
        if (next == labels) break;
        labels = next;
        centres = update(points, labels, centres);
    }
    return centres;
}

struct PQ {
    int m, k;
    std::vector<std::vector<Vec>> books;  // books[j][c]: centre c of piece j

    PQ(int m, int k) : m(m), k(k) {}

    Vec piece(const Vec& v, int j) const {
        int w = static_cast<int>(v.size()) / m;
        return Vec(v.begin() + j * w, v.begin() + (j + 1) * w);
    }

    // k-means on each piece; draws holds k numbers per piece for k-means++.
    void train(const std::vector<Vec>& vectors, const std::vector<double>& draws) {
        books.clear();
        for (int j = 0; j < m; j++) {
            std::vector<Vec> sub;
            for (const Vec& v : vectors) sub.push_back(piece(v, j));
            std::vector<int> seeds =
                kmeansPP(sub, std::vector<double>(draws.begin() + j * k, draws.begin() + (j + 1) * k));
            std::vector<Vec> start;
            for (int i : seeds) start.push_back(sub[i]);
            books.push_back(kmeans(sub, start));
        }
    }

    // The code: the nearest centre of each piece.
    std::vector<int> encode(const Vec& v) const {
        std::vector<int> code;
        for (int j = 0; j < m; j++) code.push_back(nearest(piece(v, j), books[j]));
        return code;
    }

    // Asymmetric distance to every code, from a table of piece-to-centre distances.
    std::vector<double> distances(const Vec& q, const std::vector<std::vector<int>>& codes) const {
        std::vector<Vec> table(m);
        for (int j = 0; j < m; j++)
            for (const Vec& c : books[j]) table[j].push_back(dist2(piece(q, j), c));
        std::vector<double> out;
        for (const auto& code : codes) {
            double total = 0;
            for (int j = 0; j < m; j++) total += table[j][code[j]];
            out.push_back(total);
        }
        return out;
    }
};

// The k smallest distances' indices, a tie to the lower index.
inline std::vector<int> nearestK(const std::vector<double>& dists, int k) {
    std::vector<std::pair<double, int>> order;
    for (int i = 0; i < static_cast<int>(dists.size()); i++) order.push_back({dists[i], i});
    std::sort(order.begin(), order.end());
    std::vector<int> out;
    for (int i = 0; i < std::min(k, static_cast<int>(order.size())); i++) out.push_back(order[i].second);
    return out;
}
