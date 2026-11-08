#pragma once
#include <utility>
#include <vector>

// Built left to right with a stack holding the right spine. Smallest value on top.
class CartesianTree {
 public:
  std::vector<int> values;  // node i holds A[i]
  std::vector<int> left;    // child indexes, or -1
  std::vector<int> right;
  int root = -1;

  // Add x at the end of the array. Returns how many nodes it popped.
  int append(int x) {
    int z = static_cast<int>(values.size());
    values.push_back(x);
    left.push_back(-1);
    right.push_back(-1);
    int last = -1;
    int pops = 0;
    while (!stack_.empty() && values[stack_.back()] > x) {
      last = stack_.back();
      stack_.pop_back();
      pops++;
    }
    left[z] = last;
    if (!stack_.empty()) {
      right[stack_.back()] = z;
    } else {
      root = z;
    }
    stack_.push_back(z);
    return pops;
  }

  // Index of the smallest value in A[i..j], and how many nodes the walk visited.
  std::pair<int, int> rmq(int i, int j) const {
    int x = root;
    int visited = 1;
    while (x < i || x > j) {
      x = x < i ? right[x] : left[x];
      visited++;
    }
    return {x, visited};
  }

  void preorder(int x, std::vector<int>& out) const {
    if (x < 0) return;
    out.push_back(values[x]);
    preorder(left[x], out);
    preorder(right[x], out);
  }

 private:
  std::vector<int> stack_;  // the right spine, root first
};
