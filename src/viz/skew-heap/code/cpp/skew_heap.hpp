#pragma once
#include <memory>
#include <stdexcept>
#include <utility>

// A skew min-heap: a leftist heap that keeps no npl and always swaps.
class SkewHeap {
 public:
  int size() const { return size_; }

  void insert(int key) {
    root_ = merge(std::move(root_), std::make_unique<Node>(key));
    size_++;
  }

  int delete_min() {
    if (!root_) {
      throw std::underflow_error("heap is empty");
    }
    int min = root_->key;
    root_ = merge(std::move(root_->left), std::move(root_->right));
    size_--;
    return min;
  }

  // Moves every key of other into this heap; other ends up empty.
  void merge_with(SkewHeap& other) {
    root_ = merge(std::move(root_), std::move(other.root_));
    size_ += other.size_;
    other.size_ = 0;
  }

  void clear() {
    root_.reset();
    size_ = 0;
  }

 private:
  struct Node {
    explicit Node(int k) : key(k) {}
    int key;
    std::unique_ptr<Node> left;
    std::unique_ptr<Node> right;
  };

  static std::unique_ptr<Node> merge(std::unique_ptr<Node> h1, std::unique_ptr<Node> h2) {
    if (!h1) return h2;
    if (!h2) return h1;
    if (h2->key < h1->key) std::swap(h1, h2);
    h1->right = merge(std::move(h1->right), std::move(h2));
    std::swap(h1->left, h1->right);  // always
    return h1;
  }

  std::unique_ptr<Node> root_;
  int size_ = 0;
};
