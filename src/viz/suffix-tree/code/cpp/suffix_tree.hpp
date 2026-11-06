// Suffix tree of t + "$", built by inserting each suffix into a compressed trie.
#pragma once
#include <algorithm>
#include <map>
#include <memory>
#include <string>
#include <vector>

struct Node {
  int start, end;  // edge label is s[start..end)
  int leaf;        // where the suffix starts, -1 if not a leaf
  std::map<char, std::unique_ptr<Node>> kids;  // by first character
  Node(int start, int end, int leaf = -1) : start(start), end(end), leaf(leaf) {}
};

class SuffixTree {
 public:
  explicit SuffixTree(const std::string& t) : s(t + "$"), root(0, 0) {
    for (int i = 0; i < (int)s.size(); i++) insert(i);
  }

  std::string label(const Node& u) const { return s.substr(u.start, u.end - u.start); }

  std::vector<int> search(const std::string& p) const {
    std::vector<int> out;
    if (const Node* u = walk(p)) leaves(*u, out);
    std::sort(out.begin(), out.end());
    return out;
  }

  int count(const std::string& p) const { return (int)search(p).size(); }

  // Path label of the deepest internal node (first in sorted order on ties).
  std::string longestRepeat() const {
    std::string best;
    deepest(root, "", best);
    return best;
  }

  const std::string s;
  Node root;

 private:
  void insert(int i) {
    Node* u = &root;
    int j = i, n = (int)s.size();
    while (true) {
      auto it = u->kids.find(s[j]);
      if (it == u->kids.end()) {  // no edge starts with s[j]: new leaf
        u->kids[s[j]] = std::make_unique<Node>(j, n, i);
        return;
      }
      Node* child = it->second.get();
      int len = child->end - child->start, k = 0;
      while (k < len && s[child->start + k] == s[j + k]) k++;
      if (k == len) {  // whole edge matched: go down
        u = child;
        j += k;
        continue;
      }
      auto mid = std::make_unique<Node>(child->start, child->start + k);  // split after k
      std::unique_ptr<Node> old = std::move(it->second);
      old->start += k;
      char c = s[old->start];
      mid->kids[c] = std::move(old);
      mid->kids[s[j + k]] = std::make_unique<Node>(j + k, n, i);
      u->kids[s[j]] = std::move(mid);
      return;
    }
  }

  // The node where the path for p ends (or inside whose edge), or nullptr.
  const Node* walk(const std::string& p) const {
    const Node* u = &root;
    size_t j = 0;
    while (j < p.size()) {
      auto it = u->kids.find(p[j]);
      if (it == u->kids.end()) return nullptr;
      std::string edge = label(*it->second);
      size_t k = 0;
      for (; k < edge.size() && j + k < p.size(); k++)
        if (edge[k] != p[j + k]) return nullptr;
      u = it->second.get();
      j += k;
    }
    return u;
  }

  void leaves(const Node& u, std::vector<int>& out) const {
    if (u.leaf >= 0) out.push_back(u.leaf);
    for (const auto& [c, kid] : u.kids) leaves(*kid, out);
  }

  void deepest(const Node& u, const std::string& path, std::string& best) const {
    if (u.leaf < 0 && path.size() > best.size()) best = path;
    for (const auto& [c, kid] : u.kids) deepest(*kid, path + label(*kid), best);
  }
};
