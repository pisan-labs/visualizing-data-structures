#pragma once
#include <random>
#include <vector>

// A skip list, after Pugh. A new node starts 1 level tall and grows one level per heads, up to
// maxLevel. Keys are not repeated.
class SkipList {
 public:
  explicit SkipList(double p = 0.5, int maxLevel = 5, unsigned seed = 1)
      : p_(p), maxLevel_(maxLevel), head_(new Node(0, maxLevel)), random_(seed) {}
  ~SkipList() {
    clear();
    delete head_;
  }
  SkipList(const SkipList&) = delete;
  SkipList& operator=(const SkipList&) = delete;

  bool search(int k) const {
    const Node* x = find(k)[0]->next[0];
    return x != nullptr && x->key == k;
  }

  bool insert(int k) {
    std::vector<Node*> update = find(k);
    Node* x = update[0]->next[0];
    if (x != nullptr && x->key == k) return false;
    int lvl = randomLevel();
    if (lvl > level_) level_ = lvl;
    Node* z = new Node(k, lvl);
    for (int i = 0; i < lvl; i++) {
      z->next[i] = update[i]->next[i];
      update[i]->next[i] = z;
    }
    return true;
  }

  bool remove(int k) {
    std::vector<Node*> update = find(k);
    Node* x = update[0]->next[0];
    if (x == nullptr || x->key != k) return false;
    for (int i = 0; i < static_cast<int>(x->next.size()); i++) update[i]->next[i] = x->next[i];
    delete x;
    while (level_ > 0 && head_->next[level_ - 1] == nullptr) level_--;  // the top level is empty
    return true;
  }

  // All keys in order, along level 1.
  std::vector<int> keys() const {
    std::vector<int> out;
    for (const Node* x = head_->next[0]; x != nullptr; x = x->next[0]) out.push_back(x->key);
    return out;
  }

  void clear() {
    Node* x = head_->next[0];
    while (x != nullptr) {
      Node* after = x->next[0];
      delete x;
      x = after;
    }
    head_->next.assign(maxLevel_, nullptr);
    level_ = 0;
  }

 private:
  struct Node {
    Node(int k, int level) : key(k), next(level, nullptr) {}
    int key;
    std::vector<Node*> next;  // next[i] is the next node on level i + 1
  };

  double p_;
  int maxLevel_;
  Node* head_;
  int level_ = 0;  // levels in use
  std::mt19937 random_;

  int randomLevel() {
    std::uniform_real_distribution<double> coin(0.0, 1.0);
    int lvl = 1;
    while (coin(random_) < p_ && lvl < maxLevel_) lvl++;
    return lvl;
  }

  // The last node before k on every level (the head on unused levels).
  std::vector<Node*> find(int k) const {
    std::vector<Node*> update(maxLevel_, head_);
    Node* x = head_;
    for (int i = level_ - 1; i >= 0; i--) {
      while (x->next[i] != nullptr && x->next[i]->key < k) x = x->next[i];  // right
      update[i] = x;                                                         // then down
    }
    return update;
  }
};
