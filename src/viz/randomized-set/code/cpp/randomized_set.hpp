#pragma once
#include <cstddef>
#include <functional>
#include <random>
#include <unordered_map>
#include <utility>
#include <vector>

// A set with insert, remove and a random value, all O(1) expected.
class RandomizedSet {
 public:
  // pick(n) returns a random index from 0 to n - 1.
  using Pick = std::function<std::size_t(std::size_t)>;

  RandomizedSet() : pick_(uniform_index()) {}

  explicit RandomizedSet(Pick pick) : pick_(std::move(pick)) {}

  bool insert(int x) {
    if (index_.count(x)) return false;
    index_[x] = items_.size();
    items_.push_back(x);
    return true;
  }

  bool remove(int x) {
    auto it = index_.find(x);
    if (it == index_.end()) return false;
    std::size_t i = it->second;
    int last = items_.back();
    items_[i] = last;  // fill the hole with the last value
    items_.pop_back();
    index_[last] = i;
    index_.erase(x);
    return true;
  }

  int get_random() const { return items_[pick_(items_.size())]; }

  std::size_t size() const { return items_.size(); }

 private:
  static Pick uniform_index() {
    return [gen = std::mt19937{std::random_device{}()}](std::size_t n) mutable {
      return std::uniform_int_distribution<std::size_t>(0, n - 1)(gen);
    };
  }

  std::vector<int> items_;  // the values, in no particular order
  std::unordered_map<int, std::size_t> index_;  // value -> its index in items_
  Pick pick_;
};
