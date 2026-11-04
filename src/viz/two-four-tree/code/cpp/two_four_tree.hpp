#pragma once
#include <cstddef>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

// A 2-4 tree, as in Goodrich and Tamassia: every node has 2, 3 or 4 children and every leaf is
// at the same depth. Keys are not repeated.
class TwoFourTree {
 public:
  bool search(int k) const {
    const Node* x = root_.get();
    while (x != nullptr) {
      std::size_t i = 0;
      while (i < x->keys.size() && k > x->keys[i]) i++;
      if (i < x->keys.size() && x->keys[i] == k) return true;
      x = x->leaf() ? nullptr : x->children[i].get();
    }
    return false;
  }

  bool insert(int k) {
    if (search(k)) return false;
    if (!root_) {
      root_ = std::make_unique<Node>();
      root_->keys.push_back(k);
      return true;
    }
    std::optional<Split> split = insert(*root_, k);
    if (split) {  // the root overflowed: a new root holds its middle key
      auto r = std::make_unique<Node>();
      r->keys.push_back(split->key);
      r->children.push_back(std::move(root_));
      r->children.push_back(std::move(split->right));
      root_ = std::move(r);
    }
    return true;
  }

  bool remove(int k) {
    if (!search(k)) return false;
    remove(*root_, k);
    if (root_->keys.empty()) {  // an empty root goes away
      root_ = root_->leaf() ? nullptr : std::move(root_->children[0]);
    }
    return true;
  }

  // All keys in order.
  std::vector<int> keys() const {
    std::vector<int> out;
    if (root_) walk(*root_, out);
    return out;
  }

 private:
  struct Node {
    std::vector<int> keys;                        // 1 to 3 keys
    std::vector<std::unique_ptr<Node>> children;  // empty for a leaf
    bool leaf() const { return children.empty(); }
  };

  // What an overflowing node hands to its parent: the middle key and the new right half.
  struct Split {
    int key;
    std::unique_ptr<Node> right;
  };

  std::unique_ptr<Node> root_;

  // Insert k under x. If x overflows, split it and return the middle key and right half.
  std::optional<Split> insert(Node& x, int k) {
    std::size_t i = 0;
    while (i < x.keys.size() && k > x.keys[i]) i++;
    if (x.leaf()) {
      x.keys.insert(x.keys.begin() + i, k);
    } else if (std::optional<Split> split = insert(*x.children[i], k)) {
      x.keys.insert(x.keys.begin() + i, split->key);
      x.children.insert(x.children.begin() + i + 1, std::move(split->right));
    }
    if (x.keys.size() < 4) return std::nullopt;
    // Overflow: x is a 5-node. Keep keys 1-2, the 3rd moves up, the 4th is a new node.
    auto right = std::make_unique<Node>();
    right->keys.push_back(x.keys[3]);
    int middle = x.keys[2];
    x.keys.resize(2);
    if (!x.leaf()) {
      for (std::size_t j = 3; j < 5; j++) right->children.push_back(std::move(x.children[j]));
      x.children.resize(3);
    }
    return Split{middle, std::move(right)};
  }

  // Delete k under x, then fix any child of x that underflowed.
  void remove(Node& x, int k) {
    std::size_t i = 0;
    while (i < x.keys.size() && k > x.keys[i]) i++;
    if (i < x.keys.size() && x.keys[i] == k) {
      if (x.leaf()) {
        x.keys.erase(x.keys.begin() + i);
        return;
      }
      // Swap k with its predecessor, the last key of the rightmost leaf on its left.
      Node* leaf = x.children[i].get();
      while (!leaf->leaf()) leaf = leaf->children.back().get();
      std::swap(x.keys[i], leaf->keys.back());
    }
    remove(*x.children[i], k);
    if (x.children[i]->keys.empty()) fix(x, i);
  }

  // x.children[i] has no keys: transfer a key from a sibling, or fuse with one.
  static void fix(Node& x, std::size_t i) {
    Node& c = *x.children[i];
    Node* left = i > 0 ? x.children[i - 1].get() : nullptr;
    Node* right = i + 1 < x.children.size() ? x.children[i + 1].get() : nullptr;
    if (left != nullptr && left->keys.size() > 1) {  // transfer from the left sibling
      c.keys.insert(c.keys.begin(), x.keys[i - 1]);
      x.keys[i - 1] = left->keys.back();
      left->keys.pop_back();
      if (!left->leaf()) {
        c.children.insert(c.children.begin(), std::move(left->children.back()));
        left->children.pop_back();
      }
    } else if (right != nullptr && right->keys.size() > 1) {  // transfer from the right sibling
      c.keys.push_back(x.keys[i]);
      x.keys[i] = right->keys.front();
      right->keys.erase(right->keys.begin());
      if (!right->leaf()) {
        c.children.push_back(std::move(right->children.front()));
        right->children.erase(right->children.begin());
      }
    } else if (right != nullptr) {  // fusion with the right sibling
      c.keys.push_back(x.keys[i]);
      c.keys.insert(c.keys.end(), right->keys.begin(), right->keys.end());
      for (auto& child : right->children) c.children.push_back(std::move(child));
      x.keys.erase(x.keys.begin() + i);
      x.children.erase(x.children.begin() + i + 1);
    } else {  // fusion with the left sibling
      left->keys.push_back(x.keys[i - 1]);
      for (auto& child : c.children) left->children.push_back(std::move(child));
      x.keys.erase(x.keys.begin() + i - 1);
      x.children.erase(x.children.begin() + i);
    }
  }

  static void walk(const Node& x, std::vector<int>& out) {
    for (std::size_t i = 0; i < x.keys.size(); i++) {
      if (!x.leaf()) walk(*x.children[i], out);
      out.push_back(x.keys[i]);
    }
    if (!x.leaf()) walk(*x.children.back(), out);
  }
};
