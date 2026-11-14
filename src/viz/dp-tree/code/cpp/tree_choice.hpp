#pragma once
#include <algorithm>
#include <unordered_map>
#include <utility>
#include <vector>

struct Node {
    int value;
    Node* left = nullptr;
    Node* right = nullptr;
    explicit Node(int v) : value(v) {}
};

using Pair = std::pair<int, int>;  // {take, skip}

// The best total in node's subtree with node chosen, and without it.
inline Pair takeSkip(const Node* node, std::unordered_map<const Node*, Pair>& memo) {
    if (!node) return {0, 0};
    auto [lt, ls] = takeSkip(node->left, memo);
    auto [rt, rs] = takeSkip(node->right, memo);
    int take = node->value + ls + rs;              // node in: both children stay out
    int skip = std::max(lt, ls) + std::max(rt, rs);  // node out: each child's better value
    memo[node] = {take, skip};
    return {take, skip};
}

inline void walk(const Node* node, bool parentIn,
                 const std::unordered_map<const Node*, Pair>& memo, std::vector<int>& out) {
    if (!node) return;
    auto [t, s] = memo.at(node);
    bool use = !parentIn && t > s;  // a tie leaves the node out
    if (use) out.push_back(node->value);
    walk(node->left, use, memo, out);
    walk(node->right, use, memo, out);
}

// The best total (first) and the chosen values in preorder.
inline std::vector<int> bestChoice(const Node* root) {
    std::unordered_map<const Node*, Pair> memo;
    auto [take, skip] = takeSkip(root, memo);
    std::vector<int> out{std::max(take, skip)};
    walk(root, false, memo, out);
    return out;
}
