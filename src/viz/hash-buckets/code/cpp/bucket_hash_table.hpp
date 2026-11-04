#pragma once
#include <optional>
#include <string>
#include <vector>

// B buckets of b slots each. Keys that do not fit go to a shared overflow area.
class BucketHashTable {
 public:
  BucketHashTable(int B, int b) : buckets_(B, std::vector<std::optional<int>>(b)) {}

  // Adds k and returns true, or returns false if k is already there.
  bool insert(int k) {
    probes_ = 0;
    auto& bucket = buckets_[h(k)];
    int free = -1;
    for (int t = 0; t < static_cast<int>(bucket.size()); t++) {
      probes_++;
      if (bucket[t] == k) return false;
      if (!bucket[t] && free < 0) free = t;
    }
    if (free >= 0) {
      bucket[free] = k;
      return true;
    }
    for (int x : overflow_) {
      probes_++;
      if (x == k) return false;
    }
    overflow_.push_back(k);
    return true;
  }

  bool search(int k) {
    probes_ = 0;
    const auto& bucket = buckets_[h(k)];
    for (const auto& x : bucket) {
      probes_++;
      if (x == k) return true;
    }
    if (has_room(bucket)) return false;  // k never overflowed
    for (int x : overflow_) {
      probes_++;
      if (x == k) return true;
    }
    return false;
  }

  bool remove(int k) {
    probes_ = 0;
    int i = h(k);
    auto& bucket = buckets_[i];
    for (auto& slot : bucket) {
      probes_++;
      if (slot == k) {
        slot.reset();
        // Pull a key of this bucket back from the overflow area.
        for (auto it = overflow_.begin(); it != overflow_.end(); ++it) {
          if (h(*it) == i) {
            slot = *it;
            overflow_.erase(it);
            break;
          }
        }
        return true;
      }
    }
    if (has_room(bucket)) return false;
    for (auto it = overflow_.begin(); it != overflow_.end(); ++it) {
      probes_++;
      if (*it == k) {
        overflow_.erase(it);
        return true;
      }
    }
    return false;
  }

  void clear() {
    for (auto& bucket : buckets_) bucket.assign(bucket.size(), std::nullopt);
    overflow_.clear();
  }

  int probes() const { return probes_; }

  // The buckets, then the overflow area, as text.
  std::string show() const {
    std::string out;
    for (size_t i = 0; i < buckets_.size(); i++) {
      if (i > 0) out += " | ";
      for (size_t t = 0; t < buckets_[i].size(); t++) {
        if (t > 0) out += " ";
        out += buckets_[i][t] ? std::to_string(*buckets_[i][t]) : "-";
      }
    }
    out += " ||";
    if (overflow_.empty()) out += " -";
    for (int x : overflow_) out += " " + std::to_string(x);
    return out;
  }

 private:
  int h(int k) const { return k % static_cast<int>(buckets_.size()); }

  static bool has_room(const std::vector<std::optional<int>>& bucket) {
    for (const auto& x : bucket) {
      if (!x) return true;
    }
    return false;
  }

  std::vector<std::vector<std::optional<int>>> buckets_;
  std::vector<int> overflow_;
  int probes_ = 0;
};
