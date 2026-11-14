#pragma once
#include <cmath>
#include <functional>
#include <string>
#include <vector>

// Monte Carlo tree search with UCB1 (UCT) on a tree of words with rewards at
// the leaves. Nodes live in one vector and refer to each other by index.
struct Node {
    std::string word;
    int parent;                 // -1 for the root
    double reward;              // for a leaf
    std::vector<int> children;  // every next word, in order
    std::size_t tried = 0;      // how many children are in the search tree
    int n = 0;                  // visits
    double w = 0;               // total reward
};

// UCB1: the mean reward, plus a bonus for being tried less often.
inline double ucb(const std::vector<Node>& t, int id, double c) {
    const Node& v = t[id];
    return v.w / v.n + c * std::sqrt(std::log(t[v.parent].n) / v.n);
}

// One iteration; returns the path from the root, with the rollout's leaf last.
inline std::vector<int> iterate(std::vector<Node>& t, double c,
                                const std::function<double()>& random) {
    std::vector<int> path = {0};
    int node = 0;
    // Selection: while every child is in the tree, follow the best UCB1.
    while (!t[node].children.empty() && t[node].tried == t[node].children.size()) {
        int best = -1;
        double top = -INFINITY;
        for (int ch : t[node].children) {
            double u = ucb(t, ch, c);
            if (u > top) {  // the first on a tie
                top = u;
                best = ch;
            }
        }
        node = best;
        path.push_back(node);
    }
    // Expansion: add the first child not tried yet.
    if (!t[node].children.empty()) {
        node = t[node].children[t[node].tried++];
        path.push_back(node);
    }
    // Rollout: random children until the end; the leaf has the reward.
    int leaf = node;
    while (!t[leaf].children.empty()) {
        const auto& kids = t[leaf].children;
        leaf = kids[static_cast<std::size_t>(std::floor(random() * kids.size()))];
    }
    // Backpropagation: every node on the path gets the visit and the reward.
    for (int v : path) {
        t[v].n++;
        t[v].w += t[leaf].reward;
    }
    path.push_back(leaf);
    return path;
}

// The most visited child of the root (the first on a tie).
inline int bestMove(const std::vector<Node>& t) {
    int best = t[0].children[0];
    for (int ch : t[0].children)
        if (t[ch].n > t[best].n) best = ch;
    return best;
}
