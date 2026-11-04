#pragma once
#include <algorithm>
#include <vector>

// A binary search tree of distinct keys that rotates to stay balanced.
template <typename K>
class AVLTree {
 public:
  struct Node {
    K key;
    Node* left = nullptr;
    Node* right = nullptr;
    int height = 0;  // a leaf has height 0
    explicit Node(const K& k) : key(k) {}
  };

  AVLTree() = default;
  AVLTree(const AVLTree&) = delete;
  AVLTree& operator=(const AVLTree&) = delete;
  ~AVLTree() { destroy(root); }

  Node* root = nullptr;
  int size = 0;
  int rotations = 0;  // single rotations so far; a double rotation counts 2

  static int height(const Node* x) { return x == nullptr ? -1 : x->height; }

  // Left height minus right height: -1, 0 or +1 in an AVL tree.
  static int balance(const Node* x) { return height(x->left) - height(x->right); }

  Node* search(const K& k) const {
    Node* x = root;
    while (x != nullptr && k != x->key) x = k < x->key ? x->left : x->right;
    return x;
  }

  bool insert(const K& k) {
    if (search(k) != nullptr) return false;
    root = insert(root, k);
    size++;
    return true;
  }

  bool remove(const K& k) {
    if (search(k) == nullptr) return false;
    root = remove(root, k);
    size--;
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
  static void update(Node* x) { x->height = 1 + std::max(height(x->left), height(x->right)); }

  Node* insert(Node* x, const K& k) {
    if (x == nullptr) return new Node(k);
    if (k < x->key) {
      x->left = insert(x->left, k);
    } else {
      x->right = insert(x->right, k);
    }
    return rebalance(x);
  }

  Node* remove(Node* x, const K& k) {
    if (k < x->key) {
      x->left = remove(x->left, k);
    } else if (x->key < k) {
      x->right = remove(x->right, k);
    } else if (x->left == nullptr || x->right == nullptr) {
      Node* child = x->left != nullptr ? x->left : x->right;
      delete x;
      return child;
    } else {
      Node* y = minimum(x->right);  // the successor takes x's place
      x->key = y->key;
      x->right = remove(x->right, y->key);
    }
    return rebalance(x);
  }

  // Fix x's height; if x is out of balance, rotate. Returns the subtree's new root.
  Node* rebalance(Node* x) {
    update(x);
    if (balance(x) == 2) {  // too tall on the left
      // LR: turn it into LL first.
      if (balance(x->left) < 0) x->left = rotateLeft(x->left);
      return rotateRight(x);  // LL
    }
    if (balance(x) == -2) {  // too tall on the right
      // RL: turn it into RR first.
      if (balance(x->right) > 0) x->right = rotateRight(x->right);
      return rotateLeft(x);  // RR
    }
    return x;
  }

  Node* rotateRight(Node* x) {
    Node* y = x->left;
    x->left = y->right;  // y's right subtree moves across
    y->right = x;
    update(x);  // x is now below y, so fix it first
    update(y);
    rotations++;
    return y;
  }

  Node* rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    y->left = x;
    update(x);
    update(y);
    rotations++;
    return y;
  }

  // Postorder: free both subtrees before the node itself.
  static void destroy(Node* x) {
    if (x == nullptr) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
