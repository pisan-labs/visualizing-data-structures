#pragma once
#include <map>
#include <memory>
#include <string>
#include <vector>

// A trie of lowercase words. Delete removes the nodes that no longer lead to a word.
class Trie {
 public:
  struct Node {
    std::map<char, std::unique_ptr<Node>> children;  // kept in letter order
    bool end = false;                                 // a word ends here
  };

  std::unique_ptr<Node> root = std::make_unique<Node>();

  // Adds word. Returns false if it was already there.
  bool insert(const std::string& word) {
    Node* x = root.get();
    for (char c : word) {
      std::unique_ptr<Node>& next = x->children[c];
      if (!next) next = std::make_unique<Node>();
      x = next.get();
    }
    if (x->end) return false;
    x->end = true;
    return true;
  }

  bool search(const std::string& word) const {
    const Node* x = find(word);
    return x != nullptr && x->end;
  }

  // Removes word. Returns false if it was not there.
  bool remove(const std::string& word) {
    std::vector<Node*> path{root.get()};  // the nodes from the root down to the last letter
    for (char c : word) {
      auto it = path.back()->children.find(c);
      if (it == path.back()->children.end()) return false;
      path.push_back(it->second.get());
    }
    if (!path.back()->end) return false;
    path.back()->end = false;
    // Walk back up, cutting off the nodes that lead nowhere.
    for (std::size_t i = word.size(); i > 0; i--) {
      const Node* x = path[i];
      if (x->end || !x->children.empty()) break;
      path[i - 1]->children.erase(word[i - 1]);  // frees x
    }
    return true;
  }

  // Every word that starts with prefix, in alphabetical order.
  std::vector<std::string> startsWith(const std::string& prefix) const {
    std::vector<std::string> out;
    const Node* x = find(prefix);
    std::string s = prefix;
    if (x != nullptr) collect(x, s, out);
    return out;
  }

 private:
  const Node* find(const std::string& s) const {
    const Node* x = root.get();
    for (char c : s) {
      auto it = x->children.find(c);
      if (it == x->children.end()) return nullptr;
      x = it->second.get();
    }
    return x;
  }

  static void collect(const Node* x, std::string& s, std::vector<std::string>& out) {
    if (x->end) out.push_back(s);
    for (const auto& [c, child] : x->children) {
      s.push_back(c);
      collect(child.get(), s, out);
      s.pop_back();
    }
  }
};
