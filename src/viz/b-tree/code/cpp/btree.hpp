#pragma once
#include <cstddef>
#include <memory>
#include <utility>
#include <vector>

// A B-tree of minimum degree t, as in CLRS. Every node except the root holds t - 1 to 2t - 1
// keys. Keys are not repeated.
class BTree {
 public:
  explicit BTree(std::size_t t = 3) : t_(t), root_(std::make_unique<Node>()) {}

  bool search(int k) const {
    const Node* x = root_.get();
    while (true) {
      std::size_t i = 0;
      while (i < x->keys.size() && k > x->keys[i]) i++;
      if (i < x->keys.size() && k == x->keys[i]) return true;
      if (x->leaf()) return false;
      x = x->children[i].get();  // a disk read in a real B-tree
    }
  }

  bool insert(int k) {
    if (search(k)) return false;
    if (root_->keys.size() == 2 * t_ - 1) {  // a full root splits first
      auto s = std::make_unique<Node>();
      s->children.push_back(std::move(root_));
      root_ = std::move(s);
      splitChild(*root_, 0);
    }
    insertNonfull(*root_, k);
    return true;
  }

  bool remove(int k) {
    bool found = remove(*root_, k);
    if (root_->keys.empty() && !root_->leaf()) {
      root_ = std::move(root_->children[0]);  // the tree gets shorter
    }
    return found;
  }

  // All keys in order.
  std::vector<int> keys() const {
    std::vector<int> out;
    walk(*root_, out);
    return out;
  }

 private:
  struct Node {
    std::vector<int> keys;
    std::vector<std::unique_ptr<Node>> children;  // empty for a leaf
    bool leaf() const { return children.empty(); }
  };

  std::size_t t_;
  std::unique_ptr<Node> root_;

  // Split x's full child y = x.children[i] around its middle key.
  void splitChild(Node& x, std::size_t i) {
    Node& y = *x.children[i];
    auto z = std::make_unique<Node>();
    z->keys.assign(y.keys.begin() + t_, y.keys.end());
    x.keys.insert(x.keys.begin() + i, y.keys[t_ - 1]);  // the middle key moves up
    y.keys.resize(t_ - 1);
    if (!y.leaf()) {
      for (std::size_t j = t_; j < y.children.size(); j++) {
        z->children.push_back(std::move(y.children[j]));
      }
      y.children.resize(t_);
    }
    x.children.insert(x.children.begin() + i + 1, std::move(z));
  }

  void insertNonfull(Node& x, int k) {
    std::size_t i = x.keys.size();
    while (i > 0 && k < x.keys[i - 1]) i--;
    if (x.leaf()) {
      x.keys.insert(x.keys.begin() + i, k);
      return;
    }
    if (x.children[i]->keys.size() == 2 * t_ - 1) {  // split on the way down
      splitChild(x, i);
      if (k > x.keys[i]) i++;
    }
    insertNonfull(*x.children[i], k);
  }

  // Delete k under x, which has at least t keys (or is the root).
  bool remove(Node& x, int k) {
    std::size_t i = 0;
    while (i < x.keys.size() && k > x.keys[i]) i++;
    bool here = i < x.keys.size() && x.keys[i] == k;
    if (x.leaf()) {  // case 1
      if (here) x.keys.erase(x.keys.begin() + i);
      return here;
    }
    if (here) {  // case 2: k is in this internal node
      Node& y = *x.children[i];
      Node& z = *x.children[i + 1];
      if (y.keys.size() >= t_) {  // 2a: the predecessor moves up
        x.keys[i] = max(y);
        return remove(y, x.keys[i]);
      }
      if (z.keys.size() >= t_) {  // 2b: the successor moves up
        x.keys[i] = min(z);
        return remove(z, x.keys[i]);
      }
      merge(x, i);  // 2c
      return remove(y, k);
    }
    Node* c = x.children[i].get();  // case 3: k can only be under c
    if (c->keys.size() == t_ - 1) {
      Node* left = i > 0 ? x.children[i - 1].get() : nullptr;
      Node* right = i < x.keys.size() ? x.children[i + 1].get() : nullptr;
      if (left != nullptr && left->keys.size() >= t_) {  // 3a: borrow from the left
        c->keys.insert(c->keys.begin(), x.keys[i - 1]);
        x.keys[i - 1] = left->keys.back();
        left->keys.pop_back();
        if (!left->leaf()) {
          c->children.insert(c->children.begin(), std::move(left->children.back()));
          left->children.pop_back();
        }
      } else if (right != nullptr && right->keys.size() >= t_) {  // 3a: borrow from the right
        c->keys.push_back(x.keys[i]);
        x.keys[i] = right->keys.front();
        right->keys.erase(right->keys.begin());
        if (!right->leaf()) {
          c->children.push_back(std::move(right->children.front()));
          right->children.erase(right->children.begin());
        }
      } else if (right != nullptr) {  // 3b: merge with the right sibling
        merge(x, i);
      } else {  // 3b: merge with the left sibling
        merge(x, i - 1);
        c = left;
      }
    }
    return remove(*c, k);
  }

  // Merge x.children[i], x.keys[i] and x.children[i + 1] into one node.
  static void merge(Node& x, std::size_t i) {
    Node& y = *x.children[i];
    std::unique_ptr<Node> z = std::move(x.children[i + 1]);
    x.children.erase(x.children.begin() + i + 1);
    y.keys.push_back(x.keys[i]);
    x.keys.erase(x.keys.begin() + i);
    y.keys.insert(y.keys.end(), z->keys.begin(), z->keys.end());
    for (auto& child : z->children) y.children.push_back(std::move(child));
  }

  static int max(const Node& x) {
    const Node* p = &x;
    while (!p->leaf()) p = p->children.back().get();
    return p->keys.back();
  }

  static int min(const Node& x) {
    const Node* p = &x;
    while (!p->leaf()) p = p->children.front().get();
    return p->keys.front();
  }

  static void walk(const Node& x, std::vector<int>& out) {
    for (std::size_t i = 0; i < x.keys.size(); i++) {
      if (!x.leaf()) walk(*x.children[i], out);
      out.push_back(x.keys[i]);
    }
    if (!x.leaf()) walk(*x.children.back(), out);
  }
};
