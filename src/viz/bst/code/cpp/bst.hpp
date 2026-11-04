#pragma once
#include <algorithm>
#include <vector>

// A binary search tree with parent pointers. Duplicate keys are rejected.
template <typename K>
class BST {
 public:
  struct Node {
    K key;
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
    int size = 1;  // keys in this subtree, for select and rank
    Node(const K& k, Node* p) : key(k), parent(p) {}
  };

  BST() = default;
  BST(const BST&) = delete;
  BST& operator=(const BST&) = delete;
  ~BST() { destroy(root); }

  Node* root = nullptr;

  static int size(const Node* x) { return x == nullptr ? 0 : x->size; }

  Node* search(const K& k) const {
    Node* x = root;
    while (x != nullptr && k != x->key) x = k < x->key ? x->left : x->right;
    return x;
  }

  bool insert(const K& k) {
    Node* y = nullptr;
    Node* x = root;
    while (x != nullptr) {
      y = x;
      if (k == x->key) return false;
      x = k < x->key ? x->left : x->right;
    }
    Node* z = new Node(k, y);
    if (y == nullptr) {
      root = z;
    } else if (k < y->key) {
      y->left = z;
    } else {
      y->right = z;
    }
    fixSizes(y);
    return true;
  }

  bool remove(const K& k) {
    Node* z = search(k);
    if (z == nullptr) return false;
    Node* fix;
    if (z->left == nullptr) {
      fix = z->parent;
      transplant(z, z->right);
    } else if (z->right == nullptr) {
      fix = z->parent;
      transplant(z, z->left);
    } else {
      Node* y = minimum(z->right);  // the successor
      fix = y->parent == z ? y : y->parent;
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
    fixSizes(fix);
    return true;
  }

  static Node* minimum(Node* x) {
    while (x->left != nullptr) x = x->left;
    return x;
  }

  static Node* maximum(Node* x) {
    while (x->right != nullptr) x = x->right;
    return x;
  }

  static Node* successor(Node* x) {
    if (x->right != nullptr) return minimum(x->right);
    Node* y = x->parent;
    while (y != nullptr && x == y->right) {
      x = y;
      y = y->parent;
    }
    return y;
  }

  static Node* predecessor(Node* x) {
    if (x->left != nullptr) return maximum(x->left);
    Node* y = x->parent;
    while (y != nullptr && x == y->left) {
      x = y;
      y = y->parent;
    }
    return y;
  }

  // The i-th smallest key (1 is the smallest), or nullptr.
  Node* select(int i) const {
    Node* x = root;
    while (x != nullptr) {
      int r = size(x->left) + 1;
      if (i == r) return x;
      if (i < r) {
        x = x->left;
      } else {
        i -= r;
        x = x->right;
      }
    }
    return nullptr;
  }

  // The place of k in sorted order (1 is the smallest), or -1 if k is not there.
  int rank(const K& k) const {
    int r = 0;
    Node* x = root;
    while (x != nullptr) {
      if (k < x->key) {
        x = x->left;
      } else if (x->key < k) {
        r += size(x->left) + 1;
        x = x->right;
      } else {
        return r + size(x->left) + 1;
      }
    }
    return -1;
  }

  // The smallest key >= k, or nullptr.
  Node* lowerBound(const K& k) const {
    Node* best = nullptr;
    Node* x = root;
    while (x != nullptr) {
      if (!(x->key < k)) {
        best = x;
        x = x->left;
      } else {
        x = x->right;
      }
    }
    return best;
  }

  void inorder(const Node* x, std::vector<K>& out) const {
    if (x != nullptr) {
      inorder(x->left, out);
      out.push_back(x->key);
      inorder(x->right, out);
    }
  }

  int height(const Node* x) const {
    return x == nullptr ? -1 : 1 + std::max(height(x->left), height(x->right));
  }

  void clear() {
    destroy(root);
    root = nullptr;
  }

 private:
  // Put the subtree rooted at v where the subtree rooted at u was.
  void transplant(Node* u, Node* v) {
    if (u->parent == nullptr) {
      root = v;
    } else if (u == u->parent->left) {
      u->parent->left = v;
    } else {
      u->parent->right = v;
    }
    if (v != nullptr) v->parent = u->parent;
  }

  static void fixSizes(Node* x) {
    for (; x != nullptr; x = x->parent) x->size = 1 + size(x->left) + size(x->right);
  }

  // Postorder: free both subtrees before the node itself.
  static void destroy(Node* x) {
    if (x == nullptr) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
