#pragma once
#include <memory>
#include <stdexcept>
#include <utility>
#include <vector>

// A min pairing heap: a heap-ordered multiway tree stored as first child and next sibling.
class PairingHeap {
 public:
  struct Node {
    int key;
    Node* child = nullptr;  // leftmost child
    Node* next = nullptr;   // right sibling
    Node* prev = nullptr;   // left sibling, or the parent for a leftmost child
    explicit Node(int k) : key(k) {}
  };

  int size() const { return n_; }

  Node* insert(int key) {
    pool_.push_back(std::make_unique<Node>(key));
    Node* x = pool_.back().get();
    root_ = meld(root_, x);
    n_++;
    return x;  // keep it to call decrease_key later
  }

  void meld_with(PairingHeap& other) {
    root_ = meld(root_, other.root_);
    n_ += other.n_;
    for (auto& p : other.pool_) pool_.push_back(std::move(p));
    other.pool_.clear();
    other.root_ = nullptr;
    other.n_ = 0;
  }

  int delete_min() {
    if (!root_) throw std::underflow_error("heap is empty");
    int top = root_->key;
    std::vector<Node*> trees;
    for (Node* c = root_->child; c;) {
      Node* next = c->next;
      c->next = c->prev = nullptr;
      trees.push_back(c);
      c = next;
    }
    // Pass 1: meld pairs, left to right.
    std::vector<Node*> pairs;
    for (size_t i = 0; i < trees.size(); i += 2)
      pairs.push_back(meld(trees[i], i + 1 < trees.size() ? trees[i + 1] : nullptr));
    // Pass 2: meld right to left.
    Node* h = pairs.empty() ? nullptr : pairs.back();
    for (int i = static_cast<int>(pairs.size()) - 2; i >= 0; i--) h = meld(pairs[i], h);
    root_ = h;
    n_--;
    return top;
  }

  void decrease_key(Node* x, int k) {
    if (k > x->key) throw std::invalid_argument("new key is larger");
    x->key = k;
    if (x == root_) return;
    if (x->prev->child == x) x->prev->child = x->next;
    else x->prev->next = x->next;
    if (x->next) x->next->prev = x->prev;
    x->next = x->prev = nullptr;
    root_ = meld(root_, x);
  }

  // The first node holding key, in preorder. Real code keeps the nodes insert returns.
  Node* find(int key) const {
    std::vector<Node*> stack;
    if (root_) stack.push_back(root_);
    while (!stack.empty()) {
      Node* x = stack.back();
      stack.pop_back();
      if (x->key == key) return x;
      if (x->next) stack.push_back(x->next);
      if (x->child) stack.push_back(x->child);
    }
    return nullptr;
  }

  void clear() {
    root_ = nullptr;
    n_ = 0;
    pool_.clear();
  }

 private:
  Node* root_ = nullptr;
  int n_ = 0;
  std::vector<std::unique_ptr<Node>> pool_;  // owns every node

  // Link two roots: the larger becomes the leftmost child of the smaller.
  static Node* meld(Node* a, Node* b) {
    if (!a) return b;
    if (!b) return a;
    if (b->key < a->key) std::swap(a, b);
    b->next = a->child;
    if (a->child) a->child->prev = b;
    b->prev = a;
    a->child = b;
    a->next = a->prev = nullptr;
    return a;
  }
};
