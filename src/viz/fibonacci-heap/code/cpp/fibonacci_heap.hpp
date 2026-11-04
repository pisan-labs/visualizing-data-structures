#pragma once
#include <climits>
#include <cmath>
#include <stdexcept>
#include <vector>

// A Fibonacci heap (CLRS chapter 19), a min-heap.
class FibonacciHeap {
 public:
  struct Node {
    explicit Node(int k) : key(k) {}
    int key;
    int degree = 0;
    bool mark = false;
    Node* parent = nullptr;
    Node* child = nullptr;  // any one child
    Node* left = this;      // a circular list of one
    Node* right = this;
  };

  FibonacciHeap() = default;
  FibonacciHeap(const FibonacciHeap&) = delete;
  FibonacciHeap& operator=(const FibonacciHeap&) = delete;
  ~FibonacciHeap() { free_list(min_); }

  int size() const { return size_; }

  Node* insert(int key) {
    Node* x = new Node(key);
    add_root(x);
    size_++;
    return x;
  }

  int minimum() const {
    if (!min_) throw std::underflow_error("heap is empty");
    return min_->key;
  }

  // Moves every key of other into this heap; other ends up empty.
  void merge_with(FibonacciHeap& other) {
    if (other.min_) {
      if (!min_) {
        min_ = other.min_;
      } else {
        splice(min_, other.min_);
        if (other.min_->key < min_->key) min_ = other.min_;
      }
    }
    size_ += other.size_;
    other.min_ = nullptr;
    other.size_ = 0;
  }

  int extract_min() {
    Node* z = min_;
    if (!z) throw std::underflow_error("heap is empty");
    if (z->child) {
      for (Node* x : nodes_of(z->child)) {
        x->parent = nullptr;
        x->mark = false;
      }
      splice(z, z->child);
      z->child = nullptr;
    }
    if (z->right == z) {
      min_ = nullptr;
    } else {
      min_ = z->right;
      unlink(z);
      consolidate();
    }
    size_--;
    int key = z->key;
    delete z;
    return key;
  }

  void decrease_key(Node* x, int key) {
    if (key > x->key) throw std::invalid_argument("new key is greater than current key");
    x->key = key;
    Node* y = x->parent;
    if (y && x->key < y->key) {
      cut(x, y);
      cascading_cut(y);
    }
    if (x->key < min_->key) min_ = x;
  }

  void remove(Node* x) {
    decrease_key(x, INT_MIN);
    extract_min();
  }

  // A node holding key, or nullptr.
  Node* find(int key) const { return search(min_, key); }

  void clear() {
    free_list(min_);
    min_ = nullptr;
    size_ = 0;
  }

 private:
  static std::vector<Node*> nodes_of(Node* x) {
    std::vector<Node*> out;
    Node* y = x;
    do {
      out.push_back(y);
      y = y->right;
    } while (y != x);
    return out;
  }

  // Join the circular lists that a and b are in.
  static void splice(Node* a, Node* b) {
    Node* a_right = a->right;
    Node* b_left = b->left;
    a->right = b;
    b->left = a;
    b_left->right = a_right;
    a_right->left = b_left;
  }

  // Take x out of its list; it becomes a list of one.
  static void unlink(Node* x) {
    x->left->right = x->right;
    x->right->left = x->left;
    x->left = x;
    x->right = x;
  }

  static Node* search(Node* start, int key) {
    if (!start) return nullptr;
    for (Node* x : nodes_of(start)) {
      if (x->key == key) return x;
      if (Node* found = search(x->child, key)) return found;
    }
    return nullptr;
  }

  void add_root(Node* x) {
    x->parent = nullptr;
    x->mark = false;
    if (!min_) {
      x->left = x;
      x->right = x;
      min_ = x;
    } else {
      splice(min_->left, x);  // just left of min
      if (x->key < min_->key) min_ = x;
    }
  }

  void consolidate() {
    const double phi = (1 + std::sqrt(5.0)) / 2;
    std::vector<Node*> table(static_cast<int>(std::log(size_) / std::log(phi)) + 2, nullptr);
    for (Node* w : nodes_of(min_)) {
      Node* x = w;
      int d = x->degree;
      while (table[d]) {
        Node* y = table[d];
        if (x->key > y->key) std::swap(x, y);
        link(y, x);
        table[d] = nullptr;
        d++;
      }
      table[d] = x;
    }
    min_ = nullptr;
    for (Node* x : table) {
      if (x) {
        x->left = x;
        x->right = x;
        add_root(x);
      }
    }
  }

  // Root y becomes a child of root x.
  static void link(Node* y, Node* x) {
    unlink(y);
    y->parent = x;
    y->mark = false;
    if (!x->child) {
      x->child = y;
    } else {
      splice(x->child, y);
    }
    x->degree++;
  }

  void cut(Node* x, Node* y) {
    if (x->right == x) {
      y->child = nullptr;
    } else {
      if (y->child == x) y->child = x->right;
      unlink(x);
    }
    y->degree--;
    add_root(x);
  }

  void cascading_cut(Node* y) {
    for (Node* z = y->parent; z; y = z, z = z->parent) {
      if (!y->mark) {
        y->mark = true;
        return;
      }
      cut(y, z);
    }
  }

  static void free_list(Node* x) {
    if (!x) return;
    for (Node* y : nodes_of(x)) {
      free_list(y->child);
      delete y;
    }
  }

  Node* min_ = nullptr;
  int size_ = 0;
};
