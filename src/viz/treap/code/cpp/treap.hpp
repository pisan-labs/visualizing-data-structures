#pragma once
#include <algorithm>
#include <random>
#include <vector>

// A BST by keys and a heap by priorities: smaller priorities sit higher.
template <typename K>
class Treap {
 public:
  struct Node {
    K key;
    int priority;
    Node* left = nullptr;
    Node* right = nullptr;
    Node(const K& k, int p) : key(k), priority(p) {}
  };

  Treap() = default;
  Treap(const Treap&) = delete;
  Treap& operator=(const Treap&) = delete;
  ~Treap() { destroy(root); }

  Node* root = nullptr;
  int size = 0;
  int rotations = 0;

  Node* search(const K& k) const {
    Node* x = root;
    while (x != nullptr && k != x->key) x = k < x->key ? x->left : x->right;
    return x;
  }

  bool insert(const K& k) { return insert(k, std::uniform_int_distribution<int>(1, 99)(rng)); }

  bool insert(const K& k, int priority) {
    if (search(k) != nullptr) return false;
    root = insert(root, k, priority);
    size++;
    return true;
  }

  bool remove(const K& k) {
    if (search(k) == nullptr) return false;
    root = remove(root, k);
    size--;
    return true;
  }

  Node* minimum() const {
    Node* x = root;
    while (x->left != nullptr) x = x->left;
    return x;
  }

  Node* maximum() const {
    Node* x = root;
    while (x->right != nullptr) x = x->right;
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
  std::mt19937 rng{std::random_device{}()};

  Node* insert(Node* x, const K& k, int priority) {
    if (x == nullptr) return new Node(k, priority);
    if (k < x->key) {
      x->left = insert(x->left, k, priority);
      if (x->left->priority < x->priority) x = rotateRight(x);  // heap order broken
    } else {
      x->right = insert(x->right, k, priority);
      if (x->right->priority < x->priority) x = rotateLeft(x);
    }
    return x;
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
    } else if (x->left->priority < x->right->priority) {  // rotate x down, below that child
      x = rotateRight(x);
      x->right = remove(x->right, k);
    } else {
      x = rotateLeft(x);
      x->left = remove(x->left, k);
    }
    return x;
  }

  Node* rotateRight(Node* x) {
    Node* y = x->left;
    x->left = y->right;
    y->right = x;
    rotations++;
    return y;
  }

  Node* rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    y->left = x;
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
