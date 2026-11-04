#pragma once
#include <stdexcept>
#include <utility>

// A binomial queue (CLRS: binomial heap), a min-heap.
class BinomialQueue {
 public:
  struct Node {
    explicit Node(int k) : key(k) {}
    int key;
    int degree = 0;
    Node* parent = nullptr;
    Node* child = nullptr;    // the leftmost child, of the highest degree
    Node* sibling = nullptr;  // the next child to the right, or the next root
  };

  BinomialQueue() = default;
  BinomialQueue(const BinomialQueue&) = delete;
  BinomialQueue& operator=(const BinomialQueue&) = delete;
  ~BinomialQueue() { free_list(head_); }

  int size() const { return size_; }

  Node* insert(int key) {
    Node* node = new Node(key);
    head_ = unite(head_, node);
    size_++;
    return node;
  }

  int find_min() const {
    if (!head_) throw std::underflow_error("queue is empty");
    return min_root().second->key;
  }

  int extract_min() {
    if (!head_) throw std::underflow_error("queue is empty");
    auto [prev, x] = min_root();
    if (prev) {
      prev->sibling = x->sibling;
    } else {
      head_ = x->sibling;
    }
    Node* kids = nullptr;  // reverse the children: a root list of their own
    for (Node* c = x->child; c;) {
      Node* next = c->sibling;
      c->sibling = kids;
      c->parent = nullptr;
      kids = c;
      c = next;
    }
    head_ = unite(head_, kids);
    size_--;
    int key = x->key;
    delete x;
    return key;
  }

  // Moves every key of other into this queue; other ends up empty.
  void merge_with(BinomialQueue& other) {
    head_ = unite(head_, other.head_);
    size_ += other.size_;
    other.head_ = nullptr;
    other.size_ = 0;
  }

  void decrease_key(Node* x, int key) {
    if (key > x->key) throw std::invalid_argument("new key is greater than current key");
    x->key = key;
    Node* y = x;
    Node* z = y->parent;
    while (z && y->key < z->key) {
      std::swap(y->key, z->key);
      y = z;
      z = y->parent;
    }
  }

  // The first node holding key: roots left to right, each tree in preorder.
  Node* find(int key) const { return search(head_, key); }

  void clear() {
    free_list(head_);
    head_ = nullptr;
    size_ = 0;
  }

 private:
  static Node* search(Node* x, int key) {
    for (; x; x = x->sibling) {
      if (x->key == key) return x;
      if (Node* found = search(x->child, key)) return found;
    }
    return nullptr;
  }

  // The root with the smallest key, and the root before it.
  std::pair<Node*, Node*> min_root() const {
    Node* best_prev = nullptr;
    Node* best = head_;
    for (Node *prev = head_, *x = head_->sibling; x; prev = x, x = x->sibling) {
      if (x->key < best->key) {
        best_prev = prev;
        best = x;
      }
    }
    return {best_prev, best};
  }

  // Two roots of the same degree: y becomes the leftmost child of z.
  static void link(Node* y, Node* z) {
    y->parent = z;
    y->sibling = z->child;
    z->child = y;
    z->degree++;
  }

  // Merge two root lists into one, in increasing degree.
  static Node* merge_lists(Node* a, Node* b) {
    Node dummy(0);
    Node* tail = &dummy;
    while (a && b) {
      if (a->degree <= b->degree) {
        tail->sibling = a;
        a = a->sibling;
      } else {
        tail->sibling = b;
        b = b->sibling;
      }
      tail = tail->sibling;
    }
    tail->sibling = a ? a : b;
    return dummy.sibling;
  }

  // Unite two root lists, linking trees of the same degree (CLRS cases 1 to 4).
  static Node* unite(Node* h1, Node* h2) {
    Node* h = merge_lists(h1, h2);
    if (!h) return nullptr;
    Node* prev = nullptr;
    Node* x = h;
    Node* next = x->sibling;
    while (next) {
      Node* sib = next->sibling;
      if (x->degree != next->degree || (sib && sib->degree == x->degree)) {
        prev = x;
        x = next;
      } else if (x->key <= next->key) {
        x->sibling = sib;
        link(next, x);
      } else {
        if (prev) {
          prev->sibling = next;
        } else {
          h = next;
        }
        link(x, next);
        x = next;
      }
      next = x->sibling;
    }
    return h;
  }

  static void free_list(Node* x) {
    while (x) {
      Node* next = x->sibling;
      free_list(x->child);
      delete x;
      x = next;
    }
  }

  Node* head_ = nullptr;
  int size_ = 0;
};
