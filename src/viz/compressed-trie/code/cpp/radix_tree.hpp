#pragma once
#include <algorithm>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

// A compressed trie: each edge holds a string, and a node is kept only where the paths branch
// or a word ends.
class RadixTree {
 public:
  struct Node {
    std::string edge;  // the letters on the edge into this node
    bool end = false;  // a word ends here
    std::map<char, std::unique_ptr<Node>> children;  // by the first letter of their edges
  };

  std::unique_ptr<Node> root = std::make_unique<Node>();

  // Length of the longest common prefix of a and b.
  static std::size_t common(const std::string& a, const std::string& b) {
    std::size_t k = 0;
    while (k < std::min(a.size(), b.size()) && a[k] == b[k]) k++;
    return k;
  }

  // Adds word. Returns false if it was already there.
  bool insert(const std::string& word) {
    Node* x = root.get();
    std::string s = word;
    while (!s.empty()) {
      auto it = x->children.find(s[0]);
      if (it == x->children.end()) {
        auto leaf = std::make_unique<Node>();
        leaf->edge = s;
        leaf->end = true;
        x->children[s[0]] = std::move(leaf);
        return true;
      }
      Node* y = it->second.get();
      std::size_t k = common(y->edge, s);
      if (k < y->edge.size()) y = split(x, k, s[0]);
      x = y;
      s = s.substr(k);
    }
    if (x->end) return false;
    x->end = true;
    return true;
  }

  bool search(const std::string& word) const {
    const Node* x = root.get();
    std::string s = word;
    while (!s.empty()) {
      auto it = x->children.find(s[0]);
      if (it == x->children.end() || s.compare(0, it->second->edge.size(), it->second->edge) != 0)
        return false;
      x = it->second.get();
      s = s.substr(x->edge.size());
    }
    return x->end;
  }

  // Removes word. Returns false if it was not there.
  bool remove(const std::string& word) {
    Node* parent = nullptr;
    Node* x = root.get();
    std::string s = word;
    while (!s.empty()) {
      auto it = x->children.find(s[0]);
      if (it == x->children.end() || s.compare(0, it->second->edge.size(), it->second->edge) != 0)
        return false;
      parent = x;
      x = it->second.get();
      s = s.substr(x->edge.size());
    }
    if (!x->end) return false;
    x->end = false;
    if (x->children.empty()) {
      parent->children.erase(x->edge[0]);  // frees x
      if (parent != root.get() && !parent->end && parent->children.size() == 1) merge(parent);
    } else if (x->children.size() == 1) {
      merge(x);
    }
    return true;
  }

  // Every word that starts with prefix, in alphabetical order.
  std::vector<std::string> startsWith(const std::string& prefix) const {
    std::vector<std::string> out;
    const Node* x = root.get();
    std::string s = prefix;
    std::string path;
    while (!s.empty()) {
      auto it = x->children.find(s[0]);
      if (it == x->children.end()) return out;
      const std::string& edge = it->second->edge;
      std::size_t n = std::min(s.size(), edge.size());
      if (s.compare(0, n, edge, 0, n) != 0) return out;
      // Go down the edge, even when the prefix ends partway along it.
      x = it->second.get();
      s = s.substr(n);
      path += edge;
    }
    collect(x, path, out);
    return out;
  }

 private:
  // Splits the edge from x that starts with letter c after k letters. Returns the new node.
  static Node* split(Node* x, std::size_t k, char c) {
    std::unique_ptr<Node> y = std::move(x->children[c]);
    auto m = std::make_unique<Node>();
    m->edge = y->edge.substr(0, k);
    y->edge = y->edge.substr(k);
    char next = y->edge[0];
    m->children[next] = std::move(y);
    Node* middle = m.get();
    x->children[c] = std::move(m);
    return middle;
  }

  // x has one child and ends no word: x takes in the child's edge.
  static void merge(Node* x) {
    std::unique_ptr<Node> c = std::move(x->children.begin()->second);
    x->edge += c->edge;
    x->end = c->end;
    x->children = std::move(c->children);
  }

  static void collect(const Node* x, const std::string& w, std::vector<std::string>& out) {
    if (x->end) out.push_back(w);
    for (const auto& entry : x->children) collect(entry.second.get(), w + entry.second->edge, out);
  }
};
