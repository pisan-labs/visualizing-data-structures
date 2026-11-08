#pragma once
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

// A rope: a string kept as a binary tree of short pieces. Nodes never change, so ropes share
// them through shared_ptr.
class Rope {
 public:
  struct Node;
  using Ptr = std::shared_ptr<const Node>;
  struct Node {
    std::string text;  // empty for an internal node
    Ptr left, right;
    int weight;  // length of the left subtree; a leaf's own length
    int length;
    bool leaf() const { return !left; }
  };

  static Ptr leaf(const std::string& text) {
    int n = static_cast<int>(text.size());
    return std::make_shared<const Node>(Node{text, nullptr, nullptr, n, n});
  }

  static Ptr concat(Ptr a, Ptr b) {
    if (!a) return b;
    if (!b) return a;
    int w = a->length, n = a->length + b->length;
    return std::make_shared<const Node>(Node{"", std::move(a), std::move(b), w, n});
  }

  static std::pair<Ptr, Ptr> split(const Ptr& node, int i) {
    if (!node) return {nullptr, nullptr};
    if (node->leaf()) {
      if (i == 0) return {nullptr, node};
      if (i == node->length) return {node, nullptr};
      return {leaf(node->text.substr(0, i)), leaf(node->text.substr(i))};
    }
    if (i < node->weight) {
      auto [a, b] = split(node->left, i);
      return {a, concat(b, node->right)};
    }
    if (i == node->weight) return {node->left, node->right};
    auto [a, b] = split(node->right, i - node->weight);
    return {concat(node->left, a), b};
  }

  Rope() = default;

  // A balanced rope over text, in pieces of at most `leaf_size` characters.
  static Rope of(const std::string& text, int leaf_size) {
    int pieces = (static_cast<int>(text.size()) + leaf_size - 1) / leaf_size;
    return Rope(build(text, leaf_size, 0, pieces));
  }

  int length() const { return root_ ? root_->length : 0; }

  char index(int i) const {
    if (i < 0 || i >= length()) throw std::out_of_range("no such position");
    const Node* node = root_.get();
    while (!node->leaf()) {
      if (i < node->weight) {
        node = node->left.get();
      } else {
        i -= node->weight;
        node = node->right.get();
      }
    }
    return node->text[i];
  }

  void append(const std::string& text) { root_ = concat(root_, leaf(text)); }

  void insert(int i, const std::string& text) {
    if (i < 0 || i > length()) throw std::out_of_range("no such position");
    auto [a, b] = split(root_, i);
    root_ = concat(concat(a, leaf(text)), b);
  }

  void remove(int i, int n) {
    if (n < 1 || i < 0 || i + n > length()) throw std::out_of_range("no such range");
    auto [a, rest] = split(root_, i);
    auto [mid, b] = split(rest, n);
    root_ = concat(a, b);
  }

  // Keep the first i characters; return the rest as a new rope.
  Rope split_at(int i) {
    if (i <= 0 || i >= length()) throw std::out_of_range("cut inside the rope");
    auto [a, b] = split(root_, i);
    root_ = a;
    return Rope(b);
  }

  void join(const Rope& other) { root_ = concat(root_, other.root_); }

 private:
  Ptr root_;
  explicit Rope(Ptr root) : root_(std::move(root)) {}

  static Ptr build(const std::string& text, int leaf_size, int lo, int hi) {
    if (lo >= hi) return nullptr;
    if (hi - lo == 1) return leaf(text.substr(lo * leaf_size, leaf_size));
    int mid = (lo + hi + 1) / 2;
    return concat(build(text, leaf_size, lo, mid), build(text, leaf_size, mid, hi));
  }
};
