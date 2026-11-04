#pragma once
#include <algorithm>
#include <memory>
#include <optional>
#include <queue>
#include <vector>

// A binary tree built from a level-order list, with the four classic traversals.
template <typename T>
struct Node {
  T value;
  std::unique_ptr<Node> left, right;
  explicit Node(T v) : value(std::move(v)) {}
};

// Build from a level-order list. An empty optional marks a missing child,
// and only real nodes get children.
template <typename T>
std::unique_ptr<Node<T>> build(const std::vector<std::optional<T>>& values) {
  if (values.empty() || !values[0]) return nullptr;
  auto root = std::make_unique<Node<T>>(*values[0]);
  std::queue<Node<T>*> queue;
  queue.push(root.get());
  std::size_t i = 1;
  while (i < values.size()) {
    Node<T>* x = queue.front();
    queue.pop();
    if (values[i]) {
      x->left = std::make_unique<Node<T>>(*values[i]);
      queue.push(x->left.get());
    }
    if (i + 1 < values.size() && values[i + 1]) {
      x->right = std::make_unique<Node<T>>(*values[i + 1]);
      queue.push(x->right.get());
    }
    i += 2;
  }
  return root;
}

template <typename T>
void preorder(const Node<T>* x, std::vector<T>& out) {
  if (x != nullptr) {
    out.push_back(x->value);
    preorder(x->left.get(), out);
    preorder(x->right.get(), out);
  }
}

template <typename T>
void inorder(const Node<T>* x, std::vector<T>& out) {
  if (x != nullptr) {
    inorder(x->left.get(), out);
    out.push_back(x->value);
    inorder(x->right.get(), out);
  }
}

template <typename T>
void postorder(const Node<T>* x, std::vector<T>& out) {
  if (x != nullptr) {
    postorder(x->left.get(), out);
    postorder(x->right.get(), out);
    out.push_back(x->value);
  }
}

template <typename T>
std::vector<T> levelOrder(const Node<T>* root) {
  std::vector<T> out;
  if (root == nullptr) return out;
  std::queue<const Node<T>*> queue;
  queue.push(root);
  while (!queue.empty()) {
    const Node<T>* x = queue.front();
    queue.pop();
    out.push_back(x->value);
    if (x->left) queue.push(x->left.get());
    if (x->right) queue.push(x->right.get());
  }
  return out;
}

template <typename T>
int size(const Node<T>* x) {
  return x == nullptr ? 0 : 1 + size(x->left.get()) + size(x->right.get());
}

// Edges on the longest path down from x; -1 for an empty tree.
template <typename T>
int height(const Node<T>* x) {
  return x == nullptr ? -1 : 1 + std::max(height(x->left.get()), height(x->right.get()));
}
