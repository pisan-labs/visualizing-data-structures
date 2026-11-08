// Aho-Corasick: a trie of the patterns plus a failure link per node (the
// longest proper suffix of its string that is also in the trie) and an
// output link (the nearest node down the failure chain ending a pattern).
#pragma once
#include <map>
#include <queue>
#include <string>
#include <utility>
#include <vector>

class AhoCorasick {
 public:
  explicit AhoCorasick(const std::vector<std::string>& patterns) {
    kids_.emplace_back();
    word_.emplace_back();
    for (const std::string& p : patterns) {
      int u = 0;
      for (char c : p) {
        auto it = kids_[u].find(c);
        if (it == kids_[u].end()) {
          kids_.emplace_back();
          word_.emplace_back();
          const int v = static_cast<int>(kids_.size()) - 1;
          kids_[u][c] = v;
          u = v;
        } else {
          u = it->second;
        }
      }
      word_[u] = p;
    }
    build_links();
  }

  // (start, word) for every match, in the order the scan finds them.
  std::vector<std::pair<int, std::string>> search(const std::string& text) const {
    std::vector<std::pair<int, std::string>> found;
    int u = 0;
    for (int i = 0; i < static_cast<int>(text.size()); i++) {
      const char c = text[i];
      while (u != 0 && !kids_[u].count(c)) u = fail_[u];
      auto it = kids_[u].find(c);
      u = it == kids_[u].end() ? 0 : it->second;
      for (int d = word_[u].empty() ? dict_[u] : u; d != -1; d = dict_[d])
        found.emplace_back(i - static_cast<int>(word_[d].size()) + 1, word_[d]);
    }
    return found;
  }

 private:
  void build_links() {
    const int n = static_cast<int>(kids_.size());
    fail_.assign(n, 0);
    dict_.assign(n, -1);
    std::queue<int> queue;
    for (const auto& [c, v] : kids_[0]) queue.push(v);  // depth 1 fails to the root
    while (!queue.empty()) {
      const int u = queue.front();
      queue.pop();
      for (const auto& [c, v] : kids_[u]) {
        int f = fail_[u];
        while (f != 0 && !kids_[f].count(c)) f = fail_[f];
        auto it = kids_[f].find(c);
        const int g = it == kids_[f].end() ? 0 : it->second;
        fail_[v] = g != v ? g : 0;
        const int t = fail_[v];
        dict_[v] = word_[t].empty() ? dict_[t] : t;
        queue.push(v);
      }
    }
  }

  std::vector<std::map<char, int>> kids_;
  std::vector<std::string> word_;  // empty: no pattern ends here
  std::vector<int> fail_, dict_;    // dict_ -1: none
};
