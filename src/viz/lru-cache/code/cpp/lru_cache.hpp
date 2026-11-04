#pragma once
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>

// A hash map from key to node, plus a doubly linked list in order of use: head is the most
// recently used node, tail the least. The map owns the nodes.
class LRUCache {
 public:
  explicit LRUCache(int capacity) : capacity_(capacity) {}

  int get(int k) {
    auto it = map_.find(k);
    if (it == map_.end()) {
      misses_++;
      return -1;
    }
    hits_++;
    Node* x = it->second.get();
    if (x != head_) {
      unlink(x);
      push_front(x);
    }
    return x->value;
  }

  // Stores v under k. Returns the key it evicted, if any.
  std::optional<int> put(int k, int v) {
    auto it = map_.find(k);
    if (it != map_.end()) {
      Node* x = it->second.get();
      x->value = v;
      if (x != head_) {
        unlink(x);
        push_front(x);
      }
      return std::nullopt;
    }
    std::optional<int> evicted;
    if (static_cast<int>(map_.size()) == capacity_) {
      Node* y = tail_;
      unlink(y);
      evicted = y->key;
      map_.erase(y->key);  // frees the node
    }
    auto node = std::make_unique<Node>(Node{k, v, nullptr, nullptr});
    Node* x = node.get();
    map_[k] = std::move(node);
    push_front(x);
    return evicted;
  }

  bool contains(int k) const { return map_.count(k) > 0; }

  // "key=value" pairs from most to least recently used, then the hit and miss counts.
  std::string show() const {
    std::string out;
    for (Node* x = head_; x != nullptr; x = x->next) {
      if (!out.empty()) out += " ";
      out += std::to_string(x->key) + "=" + std::to_string(x->value);
    }
    if (out.empty()) out = "empty";
    return out + " | " + std::to_string(hits_) + " " + std::to_string(misses_);
  }

 private:
  struct Node {
    int key;
    int value;
    Node* prev;
    Node* next;
  };

  void unlink(Node* x) {
    if (x->prev != nullptr) {
      x->prev->next = x->next;
    } else {
      head_ = x->next;
    }
    if (x->next != nullptr) {
      x->next->prev = x->prev;
    } else {
      tail_ = x->prev;
    }
  }

  void push_front(Node* x) {
    x->next = head_;
    x->prev = nullptr;
    if (head_ != nullptr) {
      head_->prev = x;
    } else {
      tail_ = x;
    }
    head_ = x;
  }

  int capacity_;
  std::unordered_map<int, std::unique_ptr<Node>> map_;
  Node* head_ = nullptr;
  Node* tail_ = nullptr;
  int hits_ = 0;
  int misses_ = 0;
};
