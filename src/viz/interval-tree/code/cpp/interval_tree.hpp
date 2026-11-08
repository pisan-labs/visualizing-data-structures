#pragma once
#include <algorithm>
#include <utility>
#include <vector>

// A BST keyed on (low, high), each node knowing the largest high end below it.
class IntervalTree {
 public:
  struct Node {
    int lo, hi, max;  // max: largest high end in this subtree
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
  };

  Node* root = nullptr;
  int size = 0;

  IntervalTree() = default;
  IntervalTree(const IntervalTree&) = delete;
  IntervalTree& operator=(const IntervalTree&) = delete;
  ~IntervalTree() { destroy(root); }

  static bool overlaps(int aLo, int aHi, int bLo, int bHi) { return aLo <= bHi && bLo <= aHi; }

  Node* find(int lo, int hi) const {
    Node* x = root;
    while (x != nullptr && !(x->lo == lo && x->hi == hi))
      x = std::make_pair(lo, hi) < std::make_pair(x->lo, x->hi) ? x->left : x->right;
    return x;
  }

  bool insert(int lo, int hi) {
    if (find(lo, hi) != nullptr) return false;
    Node* parent = nullptr;
    Node* x = root;
    const auto key = std::make_pair(lo, hi);
    while (x != nullptr) {
      x->max = std::max(x->max, hi);  // the new interval will be below x
      parent = x;
      x = key < std::make_pair(x->lo, x->hi) ? x->left : x->right;
    }
    Node* z = new Node{lo, hi, hi, nullptr, nullptr, parent};
    if (parent == nullptr) root = z;
    else if (key < std::make_pair(parent->lo, parent->hi)) parent->left = z;
    else parent->right = z;
    size++;
    return true;
  }

  bool remove(int lo, int hi) {
    Node* z = find(lo, hi);
    if (z == nullptr) return false;
    Node* start;
    if (z->left == nullptr || z->right == nullptr) {
      start = z->parent;
      transplant(z, z->left != nullptr ? z->left : z->right);
    } else {
      Node* y = z->right;
      while (y->left != nullptr) y = y->left;
      if (y != z->right) {
        start = y->parent;
        transplant(y, y->right);
        y->right = z->right;
        y->right->parent = y;
      } else {
        start = y;
      }
      transplant(z, y);
      y->left = z->left;
      y->left->parent = y;
    }
    delete z;
    for (; start != nullptr; start = start->parent)  // fix max from the lowest change up
      start->max = std::max({start->hi, maxOf(start->left), maxOf(start->right)});
    size--;
    return true;
  }

  // CLRS INTERVAL-SEARCH: one interval overlapping [lo, hi] (or nullptr), and nodes visited.
  std::pair<Node*, int> overlap(int lo, int hi) const {
    Node* x = root;
    int visited = 0;
    while (x != nullptr) {
      visited++;
      if (overlaps(lo, hi, x->lo, x->hi)) break;
      x = x->left != nullptr && x->left->max >= lo ? x->left : x->right;
    }
    return {x, visited};
  }

  // Every interval overlapping [lo, hi], skipping subtrees that cannot hold one.
  std::vector<Node*> all(int lo, int hi, int& visited) const {
    std::vector<Node*> found;
    visited = 0;
    if (root != nullptr) visit(root, lo, hi, found, visited);
    return found;
  }

  int height(const Node* x) const {
    return x == nullptr ? -1 : 1 + std::max(height(x->left), height(x->right));
  }

 private:
  static int maxOf(const Node* x) { return x == nullptr ? -1 : x->max; }

  static void visit(Node* x, int lo, int hi, std::vector<Node*>& found, int& visited) {
    visited++;
    if (overlaps(lo, hi, x->lo, x->hi)) found.push_back(x);
    if (x->left != nullptr && x->left->max >= lo) visit(x->left, lo, hi, found, visited);
    if (x->right != nullptr && x->lo <= hi) visit(x->right, lo, hi, found, visited);
  }

  void transplant(Node* u, Node* v) {
    if (u->parent == nullptr) root = v;
    else if (u == u->parent->left) u->parent->left = v;
    else u->parent->right = v;
    if (v != nullptr) v->parent = u->parent;
  }

  static void destroy(Node* x) {
    if (x == nullptr) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
