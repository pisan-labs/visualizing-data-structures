#pragma once
#include <algorithm>
#include <cmath>
#include <vector>

// A BST that never rotates. alpha = 2/3: no node deeper than log base 3/2 of n.
class ScapegoatTree {
 public:
  struct Node {
    int key;
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
  };

  Node* root = nullptr;
  int n = 0;
  int maxN = 0;  // largest n since the last full rebuild
  int rebuilds = 0;

  ScapegoatTree() = default;
  ScapegoatTree(const ScapegoatTree&) = delete;
  ScapegoatTree& operator=(const ScapegoatTree&) = delete;
  ~ScapegoatTree() { destroy(root); }

  static int size(const Node* x) { return x == nullptr ? 0 : 1 + size(x->left) + size(x->right); }

  Node* search(int k) const {
    Node* x = root;
    while (x != nullptr && k != x->key) x = k < x->key ? x->left : x->right;
    return x;
  }

  bool insert(int k) {
    Node* parent = nullptr;
    Node* x = root;
    int depth = 0;
    while (x != nullptr) {
      if (k == x->key) return false;
      parent = x;
      x = k < x->key ? x->left : x->right;
      depth++;
    }
    Node* z = new Node{k, nullptr, nullptr, parent};
    if (parent == nullptr) root = z;
    else if (k < parent->key) parent->left = z;
    else parent->right = z;
    n++;
    maxN = std::max(maxN, n);
    if (std::pow(1.5, depth) > n) {  // too deep: find the scapegoat on the way up
      Node* child = z;
      Node* w = parent;
      int childSize = 1;
      while (true) {
        int wSize = childSize + 1 + size(w->left == child ? w->right : w->left);
        if (3 * childSize > 2 * wSize) break;  // child holds more than 2/3
        child = w;
        w = w->parent;
        childSize = wSize;
      }
      rebuild(w);
    }
    return true;
  }

  bool remove(int k) {
    Node* z = search(k);
    if (z == nullptr) return false;
    if (z->left == nullptr) {
      transplant(z, z->right);
    } else if (z->right == nullptr) {
      transplant(z, z->left);
    } else {
      Node* y = z->right;
      while (y->left != nullptr) y = y->left;
      if (y != z->right) {
        transplant(y, y->right);
        y->right = z->right;
        y->right->parent = y;
      }
      transplant(z, y);
      y->left = z->left;
      y->left->parent = y;
    }
    delete z;
    n--;
    if (3 * n < 2 * maxN) {  // too many deletes: rebuild everything
      if (root != nullptr) rebuild(root);
      maxN = n;
    }
    return true;
  }

  int height(const Node* x) const {
    return x == nullptr ? -1 : 1 + std::max(height(x->left), height(x->right));
  }

 private:
  void transplant(Node* u, Node* v) {
    if (u->parent == nullptr) root = v;
    else if (u == u->parent->left) u->parent->left = v;
    else u->parent->right = v;
    if (v != nullptr) v->parent = u->parent;
  }

  void rebuild(Node* w) {
    Node* parent = w->parent;
    std::vector<Node*> nodes;
    flatten(w, nodes);
    Node* top = build(nodes, 0, static_cast<int>(nodes.size()) - 1, parent);
    if (parent == nullptr) root = top;
    else if (parent->left == w) parent->left = top;
    else parent->right = top;
    rebuilds++;
  }

  static void flatten(Node* x, std::vector<Node*>& out) {
    if (x == nullptr) return;
    flatten(x->left, out);
    out.push_back(x);
    flatten(x->right, out);
  }

  static Node* build(std::vector<Node*>& nodes, int lo, int hi, Node* parent) {
    if (lo > hi) return nullptr;
    int mid = (lo + hi) / 2;
    Node* x = nodes[mid];
    x->parent = parent;
    x->left = build(nodes, lo, mid - 1, x);
    x->right = build(nodes, mid + 1, hi, x);
    return x;
  }

  static void destroy(Node* x) {
    if (x == nullptr) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
