#pragma once
#include <optional>
#include <string>
#include <vector>

// Linear probing. When one more key would push the load factor above 0.75, the table grows
// to the first prime at least twice its size and every key moves.
class ResizingTable {
 public:
  explicit ResizingTable(int m) : table_(m) {}

  // Adds k and returns what it cost, or 0 if k was already there.
  int insert(int k) {
    if (table_[slot(table_, k)] == k) return 0;
    int cost = 1;
    if (static_cast<double>(n_ + 1) / table_.size() > kMaxLoad) {
      cost += rehash(next_prime(2 * static_cast<int>(table_.size())));
    }
    table_[slot(table_, k)] = k;
    n_++;
    total_ += cost;
    return cost;
  }

  // The slot that holds k, or -1.
  int search(int k) const {
    int j = slot(table_, k);
    return table_[j] == k ? j : -1;
  }

  int capacity() const { return static_cast<int>(table_.size()); }
  long total() const { return total_; }

  // The slots as text: keys, or - when empty.
  std::string show() const {
    std::string out;
    for (size_t j = 0; j < table_.size(); j++) {
      if (j > 0) out += " ";
      out += table_[j] ? std::to_string(*table_[j]) : "-";
    }
    return out;
  }

 private:
  static constexpr double kMaxLoad = 0.75;
  using Table = std::vector<std::optional<int>>;

  // The first slot of k's probe sequence in t that is empty or holds k.
  static int slot(const Table& t, int k) {
    int m = static_cast<int>(t.size());
    int j = k % m;
    while (t[j] && *t[j] != k) j = (j + 1) % m;
    return j;
  }

  int rehash(int size) {
    Table old(size);
    old.swap(table_);
    for (const auto& x : old) {
      if (x) table_[slot(table_, *x)] = x;
    }
    return n_;  // every key moved
  }

  static bool is_prime(int n) {
    if (n < 2) return false;
    for (int d = 2; d * d <= n; d++) {
      if (n % d == 0) return false;
    }
    return true;
  }

  static int next_prime(int n) {
    while (!is_prime(n)) n++;
    return n;
  }

  Table table_;
  int n_ = 0;
  long total_ = 0;
};
