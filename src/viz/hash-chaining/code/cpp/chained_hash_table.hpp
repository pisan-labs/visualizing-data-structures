#pragma once
#include <vector>

// Separate chaining: T[i] points at a linked list of the keys that hash to i.
class ChainedHashTable {
 public:
  explicit ChainedHashTable(int m) : T_(m, nullptr) {}
  ~ChainedHashTable() { clear(); }
  ChainedHashTable(const ChainedHashTable&) = delete;
  ChainedHashTable& operator=(const ChainedHashTable&) = delete;

  // The division method. Keys are not negative, so % gives a valid index.
  int h(int k) const { return k % static_cast<int>(T_.size()); }

  bool insert(int k) {
    int i = h(k);
    for (Node* x = T_[i]; x != nullptr; x = x->next) {
      if (x->key == k) return false;  // already there
    }
    T_[i] = new Node{k, T_[i]};  // the new node goes first
    n_++;
    return true;
  }

  bool contains(int k) const {
    for (Node* x = T_[h(k)]; x != nullptr; x = x->next) {
      if (x->key == k) return true;
    }
    return false;
  }

  bool remove(int k) {
    int i = h(k);
    Node* prev = nullptr;
    Node* x = T_[i];
    while (x != nullptr && x->key != k) {
      prev = x;
      x = x->next;
    }
    if (x == nullptr) return false;
    if (prev == nullptr) {
      T_[i] = x->next;
    } else {
      prev->next = x->next;
    }
    delete x;
    n_--;
    return true;
  }

  void clear() {
    for (Node*& head : T_) {
      while (head != nullptr) {
        Node* next = head->next;
        delete head;
        head = next;
      }
    }
    n_ = 0;
  }

  double load_factor() const { return static_cast<double>(n_) / T_.size(); }
  int buckets() const { return static_cast<int>(T_.size()); }

  std::vector<int> chain(int i) const {
    std::vector<int> keys;
    for (Node* x = T_[i]; x != nullptr; x = x->next) keys.push_back(x->key);
    return keys;
  }

 private:
  struct Node {
    int key;
    Node* next;
  };
  std::vector<Node*> T_;
  int n_ = 0;
};
