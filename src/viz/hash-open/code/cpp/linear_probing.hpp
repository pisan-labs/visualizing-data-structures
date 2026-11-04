#pragma once
#include <stdexcept>
#include <string>
#include <vector>

// Open addressing with linear probing. A deleted slot keeps a tombstone.
class LinearProbingTable {
 public:
  explicit LinearProbingTable(int m) : keys_(m), state_(m, State::Empty) {}

  // Adds k and returns true, or returns false if k is already there.
  bool insert(int k) {
    int m = size();
    int d = -1;  // the first tombstone seen
    for (int i = 0; i < m; i++) {
      probes_ = i + 1;
      int j = h(k, i);
      if (state_[j] == State::Empty) {
        store(d >= 0 ? d : j, k);
        return true;
      }
      if (state_[j] == State::Deleted) {
        if (d < 0) d = j;
      } else if (keys_[j] == k) {
        return false;
      }
    }
    if (d >= 0) {
      store(d, k);
      return true;
    }
    throw std::overflow_error("no free slot");
  }

  // The slot that holds k, or -1.
  int search(int k) {
    for (int i = 0; i < size(); i++) {
      probes_ = i + 1;
      int j = h(k, i);
      if (state_[j] == State::Empty) return -1;
      if (state_[j] == State::Full && keys_[j] == k) return j;
    }
    return -1;
  }

  bool remove(int k) {
    int j = search(k);
    if (j < 0) return false;
    state_[j] = State::Deleted;
    n_--;
    return true;
  }

  void clear() {
    state_.assign(state_.size(), State::Empty);
    n_ = 0;
  }

  double load_factor() const { return static_cast<double>(n_) / size(); }
  int probes() const { return probes_; }
  int size() const { return static_cast<int>(keys_.size()); }

  // Slot j as text: its key, DEL, or - when empty.
  std::string show(int j) const {
    if (state_[j] == State::Empty) return "-";
    if (state_[j] == State::Deleted) return "DEL";
    return std::to_string(keys_[j]);
  }

 private:
  enum class State { Empty, Full, Deleted };

  int h(int k, int i) const { return (k % size() + i) % size(); }

  void store(int j, int k) {
    keys_[j] = k;
    state_[j] = State::Full;
    n_++;
  }

  std::vector<int> keys_;
  std::vector<State> state_;
  int n_ = 0;
  int probes_ = 0;
};
