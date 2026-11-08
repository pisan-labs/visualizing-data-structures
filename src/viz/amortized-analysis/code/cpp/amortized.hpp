#pragma once
#include <algorithm>
#include <functional>
#include <utility>
#include <vector>

// Two structures that count their own work, and a bank for the accounting method.

inline int doubling(int capacity) { return std::max(1, 2 * capacity); }

// An array that grows when it is full. append returns its actual cost: 1 for the write, plus
// 1 for every item a grow copies into the new array. (std::vector does the same work.)
class DynamicArray {
 public:
  explicit DynamicArray(std::function<int(int)> grow = doubling) : grow_(std::move(grow)) {}

  int size() const { return size_; }

  int append(int x) {
    int cost = 0;
    if (size_ == capacity_) {
      int bigger = grow_(capacity_);
      std::vector<int> fresh(bigger);
      for (int i = 0; i < size_; i++) {
        fresh[i] = data_[i];
        cost++;
      }
      data_.swap(fresh);
      capacity_ = bigger;
    }
    data_[size_] = x;
    size_++;
    return cost + 1;
  }

 private:
  std::function<int(int)> grow_;  // the new capacity for a full array
  std::vector<int> data_;         // used as a plain block of capacity_ slots
  int capacity_ = 0;
  int size_ = 0;
};

// A k-bit counter. increment returns how many bits it flipped.
class BinaryCounter {
 public:
  explicit BinaryCounter(int k = 8) : bits_(k, 0) {}

  int increment() {
    int cost = 0;
    std::size_t i = 0;
    while (i < bits_.size() && bits_[i] == 1) {
      bits_[i] = 0;
      cost++;
      i++;
    }
    if (i < bits_.size()) {
      bits_[i] = 1;
      cost++;
    }
    return cost;
  }

 private:
  std::vector<int> bits_;  // bits_[0] is the lowest bit
};

// The accounting method: every operation pays `charge` coins in, and its actual cost comes
// out. The charge is big enough only if the balance never goes below zero.
class Bank {
 public:
  explicit Bank(int charge) : charge_(charge) {}

  int pay(int cost) {
    balance_ += charge_ - cost;
    return balance_;
  }

 private:
  int charge_;
  int balance_ = 0;
};
