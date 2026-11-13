// Hierarchical navigable small world graph (Malkov and Yashunin 2018). A pair {distance, id}
// orders by distance, then by id (the point inserted first).
#pragma once
#include <algorithm>
#include <cmath>
#include <functional>
#include <queue>
#include <random>
#include <set>
#include <utility>
#include <vector>

struct Pt {
    int x, y;
};

inline int dist2(Pt a, Pt b) {
    int dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
}

using Near = std::pair<int, int>;  // {squared distance, id}

class Hnsw {
public:
    int m, efConstruction;
    std::vector<Pt> points;
    std::vector<std::vector<std::vector<int>>> links;  // links[id][layer]
    int entry = -1;
    int distances = 0;  // computed by the last insert or search

    explicit Hnsw(int m = 2, int efConstruction = 4) : m(m), efConstruction(efConstruction) {}

    // Like a skip list: layer l is reached with chance m^-l.
    int randomLevel() {
        static std::mt19937 gen(std::random_device{}());
        double u = 1.0 - std::uniform_real_distribution<double>(0, 1)(gen);
        return static_cast<int>(-std::log(u) / std::log(m));
    }

    // Best-first search of one layer. Returns the ef nearest found, nearest first.
    std::vector<Near> searchLayer(Pt q, const std::vector<Near>& entryPoints, int ef, int layer) {
        std::set<int> visited;
        std::priority_queue<Near, std::vector<Near>, std::greater<Near>> candidates;  // nearest on top
        std::priority_queue<Near> found;                                              // farthest on top
        for (const Near& p : entryPoints) {
            visited.insert(p.second);
            candidates.push(p);
            found.push(p);
        }
        while (!candidates.empty()) {
            Near c = candidates.top();
            candidates.pop();
            if (c > found.top()) break;  // farther than everything kept
            for (int e : links[c.second][layer]) {
                if (!visited.insert(e).second) continue;
                Near pe{dist(q, e), e};
                if (static_cast<int>(found.size()) < ef || pe < found.top()) {
                    candidates.push(pe);
                    found.push(pe);
                    if (static_cast<int>(found.size()) > ef) found.pop();
                }
            }
        }
        std::vector<Near> out;
        for (; !found.empty(); found.pop()) out.push_back(found.top());
        std::reverse(out.begin(), out.end());
        return out;
    }

    // Add point q at the given level; returns its id.
    int insert(Pt q, int level) {
        int id = static_cast<int>(points.size());
        points.push_back(q);
        links.emplace_back(level + 1);
        distances = 0;
        if (entry < 0) {
            entry = id;
            return id;
        }
        int top = static_cast<int>(links[entry].size()) - 1;
        std::vector<Near> eps{{dist(q, entry), entry}};
        for (int layer = top; layer > level; layer--)  // greedy: ef = 1
            eps = {searchLayer(q, eps, 1, layer).front()};
        for (int layer = std::min(top, level); layer >= 0; layer--) {
            std::vector<Near> found = searchLayer(q, eps, efConstruction, layer);
            size_t limit = layer == 0 ? 2 * m : m;
            for (size_t i = 0; i < found.size() && static_cast<int>(i) < m; i++)
                links[id][layer].push_back(found[i].second);
            for (int e : links[id][layer]) {
                std::vector<int>& theirs = links[e][layer];
                theirs.push_back(id);
                if (theirs.size() > limit) {  // keep the nearest
                    Pt p = points[e];
                    std::sort(theirs.begin(), theirs.end(), [&](int a, int b) {
                        return Near{dist2(p, points[a]), a} < Near{dist2(p, points[b]), b};
                    });
                    theirs.resize(limit);
                }
            }
            eps = found;
        }
        if (level > top) entry = id;
        return id;
    }

    // The k nearest ids found (approximate).
    std::vector<int> search(Pt q, int k, int ef) {
        distances = 0;
        int top = static_cast<int>(links[entry].size()) - 1;
        std::vector<Near> eps{{dist(q, entry), entry}};
        for (int layer = top; layer > 0; layer--) eps = {searchLayer(q, eps, 1, layer).front()};
        std::vector<int> out;
        for (const Near& f : searchLayer(q, eps, ef, 0))
            if (static_cast<int>(out.size()) < k) out.push_back(f.second);
        return out;
    }

private:
    int dist(Pt q, int i) {
        distances++;
        return dist2(q, points[i]);
    }
};
