#pragma once
#include <algorithm>
#include <cstddef>
#include <memory>
#include <optional>
#include <utility>
#include <vector>

// A B+ tree of order m: a node holds at most m - 1 keys. Every key lives in a leaf and the
// leaves are linked in order; internal keys are signposts.
class BPlusTree {
 public:
  explicit BPlusTree(std::size_t m = 4) : m_(m), root_(std::make_unique<Node>(true)) {}

  bool search(int k) const {
    const std::vector<int>& keys = leafFor(k)->keys;
    return std::find(keys.begin(), keys.end(), k) != keys.end();
  }

  std::vector<int> range(int a, int b) const {
    std::vector<int> out;
    for (const Node* x = leafFor(a); x != nullptr; x = x->next) {  // walk along the leaves
      for (int k : x->keys) {
        if (k > b) return out;
        if (k >= a) out.push_back(k);
      }
    }
    return out;
  }

  // All keys in order, read along the leaf links.
  std::vector<int> keys() const {
    const Node* x = root_.get();
    while (!x->leaf) x = x->children.front().get();
    std::vector<int> out;
    for (; x != nullptr; x = x->next) out.insert(out.end(), x->keys.begin(), x->keys.end());
    return out;
  }

  bool insert(int k) {
    if (search(k)) return false;
    if (std::optional<Split> split = insert(*root_, k)) {  // the root split: a new root
      auto r = std::make_unique<Node>(false);
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
    if (!root_->leaf && root_->keys.empty()) {
      root_ = std::move(root_->children[0]);  // the tree gets shorter
    }
    return true;
  }

 private:
  struct Node {
    explicit Node(bool isLeaf) : leaf(isLeaf) {}
    bool leaf;
    std::vector<int> keys;
    std::vector<std::unique_ptr<Node>> children;  // internal nodes only
    Node* next = nullptr;                         // leaves only: the next leaf to the right
  };

  // What an overflowing node hands to its parent: a separator and the new right half.
  struct Split {
    int key;
    std::unique_ptr<Node> right;
  };

  std::size_t m_;
  std::unique_ptr<Node> root_;

  // A leaf needs ceil((m - 1) / 2) keys; an internal node ceil(m / 2) children.
  std::size_t minKeys(const Node& x) const { return x.leaf ? m_ / 2 : (m_ + 1) / 2 - 1; }

  // How many keys are at most k: the child to take, so keys equal to a separator go right.
  static std::size_t after(const std::vector<int>& keys, int k) {
    return static_cast<std::size_t>(std::upper_bound(keys.begin(), keys.end(), k) - keys.begin());
  }

  const Node* leafFor(int k) const {
    const Node* x = root_.get();
    while (!x->leaf) x = x->children[after(x->keys, k)].get();
    return x;
  }

  // Insert k under x. If x overflows, split it and return the separator and right half.
  std::optional<Split> insert(Node& x, int k) {
    if (x.leaf) {
      x.keys.insert(x.keys.begin() + after(x.keys, k), k);
      if (x.keys.size() < m_) return std::nullopt;
      std::size_t half = (m_ + 1) / 2;
      auto right = std::make_unique<Node>(true);
      right->keys.assign(x.keys.begin() + half, x.keys.end());
      x.keys.resize(half);
      right->next = x.next;
      x.next = right.get();
      int copy = right->keys.front();  // copy up: the key stays in the leaf
      return Split{copy, std::move(right)};
    }
    std::size_t i = after(x.keys, k);
    std::optional<Split> split = insert(*x.children[i], k);
    if (!split) return std::nullopt;
    x.keys.insert(x.keys.begin() + i, split->key);
    x.children.insert(x.children.begin() + i + 1, std::move(split->right));
    if (x.keys.size() < m_) return std::nullopt;
    std::size_t mid = m_ / 2;
    int up = x.keys[mid];  // push up: the key leaves this node
    auto right = std::make_unique<Node>(false);
    right->keys.assign(x.keys.begin() + mid + 1, x.keys.end());
    for (std::size_t j = mid + 1; j < x.children.size(); j++) {
      right->children.push_back(std::move(x.children[j]));
    }
    x.keys.resize(mid);
    x.children.resize(mid + 1);
    return Split{up, std::move(right)};
  }

  void remove(Node& x, int k) {
    if (x.leaf) {
      x.keys.erase(std::find(x.keys.begin(), x.keys.end(), k));
      return;
    }
    std::size_t i = after(x.keys, k);
    remove(*x.children[i], k);
    if (x.children[i]->keys.size() < minKeys(*x.children[i])) fix(x, i);
  }

  // x.children[i] has too few keys: borrow from a sibling or merge with one.
  void fix(Node& x, std::size_t i) {
    Node& c = *x.children[i];
    Node* left = i > 0 ? x.children[i - 1].get() : nullptr;
    Node* right = i + 1 < x.children.size() ? x.children[i + 1].get() : nullptr;
    std::size_t least = minKeys(c);
    if (left != nullptr && left->keys.size() > least) {  // borrow from the left
      if (c.leaf) {
        c.keys.insert(c.keys.begin(), left->keys.back());
        left->keys.pop_back();
        x.keys[i - 1] = c.keys.front();
      } else {
        c.keys.insert(c.keys.begin(), x.keys[i - 1]);
        x.keys[i - 1] = left->keys.back();
        left->keys.pop_back();
        c.children.insert(c.children.begin(), std::move(left->children.back()));
        left->children.pop_back();
      }
    } else if (right != nullptr && right->keys.size() > least) {  // borrow from the right
      if (c.leaf) {
        c.keys.push_back(right->keys.front());
        right->keys.erase(right->keys.begin());
        x.keys[i] = right->keys.front();
      } else {
        c.keys.push_back(x.keys[i]);
        x.keys[i] = right->keys.front();
        right->keys.erase(right->keys.begin());
        c.children.push_back(std::move(right->children.front()));
        right->children.erase(right->children.begin());
      }
    } else {  // merge with the right sibling, or the left one if there is none
      if (right == nullptr) i--;
      Node& a = *x.children[i];
      std::unique_ptr<Node> b = std::move(x.children[i + 1]);
      x.children.erase(x.children.begin() + i + 1);
      int separator = x.keys[i];
      x.keys.erase(x.keys.begin() + i);
      if (a.leaf) {
        a.keys.insert(a.keys.end(), b->keys.begin(), b->keys.end());  // the separator was a copy
        a.next = b->next;
      } else {
        a.keys.push_back(separator);
        a.keys.insert(a.keys.end(), b->keys.begin(), b->keys.end());
        for (auto& child : b->children) a.children.push_back(std::move(child));
      }
    }
  }
};
