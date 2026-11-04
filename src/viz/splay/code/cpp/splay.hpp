#pragma once
#include <algorithm>
#include <vector>

// A bottom-up splay tree of distinct keys: every access moves its key to the root.
template <typename K>
class SplayTree {
 public:
  struct Node {
    K key;
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
    Node(const K& k, Node* p) : key(k), parent(p) {}
  };

  SplayTree() = default;
  SplayTree(const SplayTree&) = delete;
  SplayTree& operator=(const SplayTree&) = delete;
  ~SplayTree() { destroy(root); }

  Node* root = nullptr;
  int size = 0;
  int rotations = 0;

  bool search(const K& k) {
    Node* x = find(k);
    if (x != nullptr) splay(x, nullptr);  // even on a miss: the last node visited
    return x != nullptr && x->key == k;
  }

  bool insert(const K& k) {
    Node* y = find(k);
    if (y != nullptr && y->key == k) {
      splay(y, nullptr);
      return false;
    }
    Node* z = new Node(k, y);
    if (y == nullptr) {
      root = z;
    } else if (k < y->key) {
      y->left = z;
    } else {
      y->right = z;
    }
    size++;
    splay(z, nullptr);
    return true;
  }

  bool remove(const K& k) {
    if (!search(k)) return false;  // splays k to the root if it is there
    Node* z = root;
    if (z->left == nullptr) {
      root = z->right;
    } else {
      Node* m = z->left;
      while (m->right != nullptr) m = m->right;
      splay(m, z);  // now m is z's left child, with no right child
      m->right = z->right;
      if (z->right != nullptr) z->right->parent = m;
      root = m;
    }
    if (root != nullptr) root->parent = nullptr;
    delete z;
    size--;
    return true;
  }

  Node* minimum() {
    Node* x = root;
    while (x->left != nullptr) x = x->left;
    splay(x, nullptr);
    return x;
  }

  Node* maximum() {
    Node* x = root;
    while (x->right != nullptr) x = x->right;
    splay(x, nullptr);
    return x;
  }

  int height(const Node* x) const {
    return x == nullptr ? -1 : 1 + std::max(height(x->left), height(x->right));
  }

  void inorder(const Node* x, std::vector<K>& out) const {
    if (x != nullptr) {
      inorder(x->left, out);
      out.push_back(x->key);
      inorder(x->right, out);
    }
  }

  void clear() {
    destroy(root);
    root = nullptr;
    size = 0;
    rotations = 0;
  }

 private:
  // Rotate at x's parent so that x moves up one level.
  void rotateUp(Node* x) {
    Node* p = x->parent;
    Node* g = p->parent;
    if (x == p->left) {
      p->left = x->right;
      if (x->right != nullptr) x->right->parent = p;
      x->right = p;
    } else {
      p->right = x->left;
      if (x->left != nullptr) x->left->parent = p;
      x->left = p;
    }
    p->parent = x;
    x->parent = g;
    if (g == nullptr) {
      root = x;
    } else if (g->left == p) {
      g->left = x;
    } else {
      g->right = x;
    }
    rotations++;
  }

  // Move x up until its parent is stop (nullptr: until x is the root).
  void splay(Node* x, Node* stop) {
    while (x->parent != stop) {
      Node* p = x->parent;
      Node* g = p->parent;
      if (g == stop) {  // zig
        rotateUp(x);
      } else if ((x == p->left) == (p == g->left)) {  // zig-zig: grandparent first
        rotateUp(p);
        rotateUp(x);
      } else {  // zig-zag: parent first
        rotateUp(x);
        rotateUp(x);
      }
    }
  }

  // The node with key k, or the last node on the way down (nullptr if empty).
  Node* find(const K& k) const {
    Node* x = root;
    Node* last = nullptr;
    while (x != nullptr) {
      last = x;
      if (k == x->key) break;
      x = k < x->key ? x->left : x->right;
    }
    return last;
  }

  // Postorder: free both subtrees before the node itself.
  static void destroy(Node* x) {
    if (x == nullptr) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
