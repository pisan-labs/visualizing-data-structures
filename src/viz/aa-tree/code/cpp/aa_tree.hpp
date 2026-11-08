#pragma once
#include <algorithm>

// Levels instead of colors; horizontal (red) links only on the right.
class AATree {
 public:
  struct Node {
    int key;
    int level = 1;
    Node* left = nullptr;
    Node* right = nullptr;
  };

  Node* root = nullptr;
  int size = 0;
  int skews = 0;
  int splits = 0;

  AATree() = default;
  AATree(const AATree&) = delete;
  AATree& operator=(const AATree&) = delete;
  ~AATree() { destroy(root); }

  Node* search(int k) const {
    Node* t = root;
    while (t != nullptr && k != t->key) t = k < t->key ? t->left : t->right;
    return t;
  }

  bool insert(int k) {
    if (search(k) != nullptr) return false;
    root = insert(root, k);
    size++;
    return true;
  }

  bool remove(int k) {
    if (search(k) == nullptr) return false;
    root = remove(root, k);
    size--;
    return true;
  }

 private:
  static int level(const Node* t) { return t == nullptr ? 0 : t->level; }

  Node* skew(Node* t) {
    // A left child on t's level: rotate right.
    if (t != nullptr && t->left != nullptr && t->left->level == t->level) {
      Node* l = t->left;
      t->left = l->right;
      l->right = t;
      skews++;
      return l;
    }
    return t;
  }

  Node* split(Node* t) {
    // Two right horizontal links in a row: rotate left and lift the middle node.
    if (t != nullptr && t->right != nullptr && t->right->right != nullptr &&
        t->right->right->level == t->level) {
      Node* r = t->right;
      t->right = r->left;
      r->left = t;
      r->level++;
      splits++;
      return r;
    }
    return t;
  }

  Node* insert(Node* t, int k) {
    if (t == nullptr) return new Node{k};
    if (k < t->key) t->left = insert(t->left, k);
    else t->right = insert(t->right, k);
    return split(skew(t));
  }

  Node* remove(Node* t, int k) {
    if (k < t->key) {
      t->left = remove(t->left, k);
    } else if (k > t->key) {
      t->right = remove(t->right, k);
    } else if (t->left == nullptr && t->right == nullptr) {
      delete t;
      return nullptr;
    } else if (t->left == nullptr) {  // the successor, a leaf, stands in
      t->key = t->right->key;
      t->right = remove(t->right, t->key);
    } else {  // the predecessor, a leaf, stands in
      Node* p = t->left;
      while (p->right != nullptr) p = p->right;
      t->key = p->key;
      t->left = remove(t->left, t->key);
    }
    // Lower t's level if a child fell too far below, then repair the links.
    int should = std::min(level(t->left), level(t->right)) + 1;
    if (should < t->level) {
      t->level = should;
      if (t->right != nullptr && should < t->right->level) t->right->level = should;
    }
    t = skew(t);
    t->right = skew(t->right);
    if (t->right != nullptr) t->right->right = skew(t->right->right);
    t = split(t);
    t->right = split(t->right);
    return t;
  }

  static void destroy(Node* t) {
    if (t == nullptr) return;
    destroy(t->left);
    destroy(t->right);
    delete t;
  }
};
