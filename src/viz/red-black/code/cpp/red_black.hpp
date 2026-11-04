#pragma once
#include <algorithm>
#include <vector>

// CLRS red-black tree of distinct keys. Every missing child is the black sentinel NIL.
template <typename K>
class RedBlackTree {
 public:
  enum Color { RED, BLACK };

  struct Node {
    K key{};
    Color color = BLACK;
    Node* left = nullptr;
    Node* right = nullptr;
    Node* parent = nullptr;
  };

  RedBlackTree() { nil->left = nil->right = nil->parent = nil; }
  RedBlackTree(const RedBlackTree&) = delete;
  RedBlackTree& operator=(const RedBlackTree&) = delete;
  ~RedBlackTree() {
    destroy(root);
    delete nil;
  }

  Node* const nil = new Node();
  Node* root = nil;
  int size = 0;
  int rotations = 0;

  Node* search(const K& k) const {
    Node* x = root;
    while (x != nil && k != x->key) x = k < x->key ? x->left : x->right;
    return x;
  }

  bool insert(const K& k) {
    Node* y = nil;
    Node* x = root;
    while (x != nil) {
      if (k == x->key) return false;
      y = x;
      x = k < x->key ? x->left : x->right;
    }
    Node* z = new Node{k, RED, nil, nil, y};
    if (y == nil) {
      root = z;
    } else if (k < y->key) {
      y->left = z;
    } else {
      y->right = z;
    }
    size++;
    insertFixup(z);
    return true;
  }

  bool remove(const K& k) {
    Node* z = search(k);
    if (z == nil) return false;
    Node* y = z;
    Color lost = z->color;
    Node* x;
    if (z->left == nil) {
      x = z->right;
      transplant(z, z->right);
    } else if (z->right == nil) {
      x = z->left;
      transplant(z, z->left);
    } else {
      y = minimum(z->right);  // the successor
      lost = y->color;
      x = y->right;
      if (y != z->right) {
        transplant(y, y->right);
        y->right = z->right;
        y->right->parent = y;
      } else {
        x->parent = y;
      }
      transplant(z, y);
      y->left = z->left;
      y->left->parent = y;
      y->color = z->color;
    }
    delete z;
    size--;
    if (lost == BLACK) deleteFixup(x);
    return true;
  }

  Node* minimum(Node* x) const {
    while (x->left != nil) x = x->left;
    return x;
  }

  Node* maximum(Node* x) const {
    while (x->right != nil) x = x->right;
    return x;
  }

  // Black nodes on any path from the root down to NIL, not counting the root.
  int blackHeight() const {
    if (root == nil) return 0;
    int count = 1;  // the NIL at the end
    for (Node* x = root->left; x != nil; x = x->left) {
      if (x->color == BLACK) count++;
    }
    return count;
  }

  int height(const Node* x) const {
    return x == nil ? -1 : 1 + std::max(height(x->left), height(x->right));
  }

  void inorder(const Node* x, std::vector<K>& out) const {
    if (x != nil) {
      inorder(x->left, out);
      out.push_back(x->key);
      inorder(x->right, out);
    }
  }

  void clear() {
    destroy(root);
    root = nil;
    size = 0;
    rotations = 0;
  }

 private:
  void rotateLeft(Node* x) {
    Node* y = x->right;
    x->right = y->left;
    if (y->left != nil) y->left->parent = x;
    transplant(x, y);
    y->left = x;
    x->parent = y;
    rotations++;
  }

  void rotateRight(Node* x) {
    Node* y = x->left;
    x->left = y->right;
    if (y->right != nil) y->right->parent = x;
    transplant(x, y);
    y->right = x;
    x->parent = y;
    rotations++;
  }

  // Put the subtree rooted at v where the subtree rooted at u was.
  void transplant(Node* u, Node* v) {
    if (u->parent == nil) {
      root = v;
    } else if (u == u->parent->left) {
      u->parent->left = v;
    } else {
      u->parent->right = v;
    }
    v->parent = u->parent;  // v may be NIL: deleteFixup needs its parent
  }

  void insertFixup(Node* z) {
    while (z->parent->color == RED) {
      Node* g = z->parent->parent;
      if (z->parent == g->left) {
        Node* y = g->right;  // the uncle
        if (y->color == RED) {  // case 1: recolor
          z->parent->color = BLACK;
          y->color = BLACK;
          g->color = RED;
          z = g;
        } else {
          if (z == z->parent->right) {  // case 2: a zigzag
            z = z->parent;
            rotateLeft(z);
          }
          z->parent->color = BLACK;  // case 3: a straight line
          z->parent->parent->color = RED;
          rotateRight(z->parent->parent);
        }
      } else {
        Node* y = g->left;
        if (y->color == RED) {
          z->parent->color = BLACK;
          y->color = BLACK;
          g->color = RED;
          z = g;
        } else {
          if (z == z->parent->left) {
            z = z->parent;
            rotateRight(z);
          }
          z->parent->color = BLACK;
          z->parent->parent->color = RED;
          rotateLeft(z->parent->parent);
        }
      }
    }
    root->color = BLACK;
  }

  // x carries an extra black: move it up the tree or use it up.
  void deleteFixup(Node* x) {
    while (x != root && x->color == BLACK) {
      if (x == x->parent->left) {
        Node* w = x->parent->right;  // the sibling
        if (w->color == RED) {  // case 1
          w->color = BLACK;
          x->parent->color = RED;
          rotateLeft(x->parent);
          w = x->parent->right;
        }
        if (w->left->color == BLACK && w->right->color == BLACK) {  // case 2
          w->color = RED;
          x = x->parent;
        } else {
          if (w->right->color == BLACK) {  // case 3
            w->left->color = BLACK;
            w->color = RED;
            rotateRight(w);
            w = x->parent->right;
          }
          w->color = x->parent->color;  // case 4
          x->parent->color = BLACK;
          w->right->color = BLACK;
          rotateLeft(x->parent);
          x = root;
        }
      } else {
        Node* w = x->parent->left;
        if (w->color == RED) {
          w->color = BLACK;
          x->parent->color = RED;
          rotateRight(x->parent);
          w = x->parent->left;
        }
        if (w->right->color == BLACK && w->left->color == BLACK) {
          w->color = RED;
          x = x->parent;
        } else {
          if (w->left->color == BLACK) {
            w->right->color = BLACK;
            w->color = RED;
            rotateLeft(w);
            w = x->parent->left;
          }
          w->color = x->parent->color;
          x->parent->color = BLACK;
          w->left->color = BLACK;
          rotateRight(x->parent);
          x = root;
        }
      }
    }
    x->color = BLACK;
  }

  // Postorder: free both subtrees before the node itself.
  void destroy(Node* x) {
    if (x == nil) return;
    destroy(x->left);
    destroy(x->right);
    delete x;
  }
};
