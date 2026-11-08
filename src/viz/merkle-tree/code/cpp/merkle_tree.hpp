#pragma once
#include <cstdint>
#include <cstdio>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

// FNV-1a over the characters, folded to 16 bits, as 4 hex digits. A teaching hash only: real
// Merkle trees use SHA-256.
inline std::string toy_hash(const std::string& s) {
  uint32_t h = 0x811C9DC5u;
  for (unsigned char ch : s) {
    h ^= ch;
    h *= 0x01000193u;
  }
  char buf[8];
  std::snprintf(buf, sizeof buf, "%04x", static_cast<unsigned>((h >> 16) ^ (h & 0xFFFFu)));
  return buf;
}

// levels[0] are the leaf hashes, levels.back() is the root. A node with no partner moves up.
class MerkleTree {
 public:
  using Proof = std::vector<std::pair<char, std::string>>;  // (side of the sibling, its hash)

  explicit MerkleTree(std::vector<std::string> blocks = {}) : blocks_(std::move(blocks)) { rebuild(); }

  int size() const { return static_cast<int>(blocks_.size()); }
  std::string root() const { return levels_.empty() ? "" : levels_.back()[0]; }

  // Rehash only the path from leaf i to the root.
  void update(int i, const std::string& data) {
    if (i < 0 || i >= size()) throw std::out_of_range("no such block");
    blocks_[i] = data;
    levels_[0][i] = toy_hash(data);
    for (size_t k = 1; k < levels_.size(); k++) {
      i /= 2;
      const auto& below = levels_[k - 1];
      const std::string& a = below[2 * i];
      levels_[k][i] = 2 * i + 1 < static_cast<int>(below.size()) ? toy_hash(a + below[2 * i + 1]) : a;
    }
  }

  void append(const std::string& data) {
    blocks_.push_back(data);
    rebuild();  // simple; only the right edge really changes
  }

  Proof proof(int i) const {
    if (i < 0 || i >= size()) throw std::out_of_range("no such block");
    Proof out;
    for (size_t k = 0; k + 1 < levels_.size(); k++) {
      int sib = i ^ 1;
      if (sib < static_cast<int>(levels_[k].size())) out.push_back({sib < i ? 'L' : 'R', levels_[k][sib]});
      i /= 2;
    }
    return out;
  }

  static bool verify(const std::string& data, const Proof& proof, const std::string& root) {
    std::string h = toy_hash(data);
    for (const auto& [side, s] : proof) h = side == 'L' ? toy_hash(s + h) : toy_hash(h + s);
    return h == root;
  }

 private:
  std::vector<std::string> blocks_;
  std::vector<std::vector<std::string>> levels_;

  void rebuild() {
    levels_.clear();
    if (blocks_.empty()) return;
    std::vector<std::string> level;
    for (const auto& b : blocks_) level.push_back(toy_hash(b));
    levels_.push_back(level);
    while (level.size() > 1) {
      std::vector<std::string> up;
      for (size_t i = 0; i < level.size(); i += 2)
        up.push_back(i + 1 < level.size() ? toy_hash(level[i] + level[i + 1]) : level[i]);
      levels_.push_back(up);
      level = up;
    }
  }
};
