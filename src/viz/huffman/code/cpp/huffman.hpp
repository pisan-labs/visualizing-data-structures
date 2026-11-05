#pragma once
#include <functional>
#include <map>
#include <optional>
#include <queue>
#include <string>
#include <tuple>
#include <vector>

// Huffman coding. Ties: the tree that joined the queue first comes out first. The leaves join in
// symbol order, before any merged tree, so equal weights take leaves first, then the oldest tree.
class Huffman {
 public:
  struct Node {
    int weight;
    char symbol;     // a leaf's symbol
    int left = -1;   // index of the left child in nodes; -1 for a leaf
    int right = -1;  // index of the right child
  };

  std::vector<Node> nodes;
  int root = -1;

  // Builds the tree for the count of each symbol (a std::map keeps symbol order).
  explicit Huffman(const std::map<char, int>& counts) {
    // (weight, order joined, node): the lightest comes out first, then the oldest.
    using Entry = std::tuple<int, int, int>;
    std::priority_queue<Entry, std::vector<Entry>, std::greater<Entry>> queue;
    int order = 0;
    for (const auto& [symbol, count] : counts) {
      nodes.push_back({count, symbol});
      queue.emplace(count, order++, static_cast<int>(nodes.size()) - 1);
    }
    while (queue.size() > 1) {
      Entry x = queue.top();
      queue.pop();
      Entry y = queue.top();
      queue.pop();
      int weight = std::get<0>(x) + std::get<0>(y);
      nodes.push_back({weight, '\0', std::get<2>(x), std::get<2>(y)});
      queue.emplace(weight, order++, static_cast<int>(nodes.size()) - 1);
    }
    root = std::get<2>(queue.top());
  }

  bool isLeaf(int x) const { return nodes[x].left < 0; }

  // The code of each symbol: a 0 for each left edge, a 1 for each right edge.
  std::map<char, std::string> codes() const {
    std::map<char, std::string> table;
    if (isLeaf(root)) {
      table[nodes[root].symbol] = "0";  // a lone symbol still needs one bit
    } else {
      walk(root, "", table);
    }
    return table;
  }

  std::string encode(const std::string& text) const {
    std::map<char, std::string> table = codes();
    std::string out;
    for (char c : text) out += table.at(c);
    return out;
  }

  // The text, or nothing if the bits are not a message in this code.
  std::optional<std::string> decode(const std::string& bits) const {
    std::string out;
    if (isLeaf(root)) {
      for (char b : bits) {
        if (b != '0') return std::nullopt;
        out += nodes[root].symbol;
      }
      return out;
    }
    int x = root;
    for (char b : bits) {
      x = b == '0' ? nodes[x].left : nodes[x].right;
      if (isLeaf(x)) {
        out += nodes[x].symbol;
        x = root;
      }
    }
    if (x != root) return std::nullopt;
    return out;
  }

 private:
  void walk(int x, const std::string& code, std::map<char, std::string>& table) const {
    if (isLeaf(x)) {
      table[nodes[x].symbol] = code;
      return;
    }
    walk(nodes[x].left, code + "0", table);
    walk(nodes[x].right, code + "1", table);
  }
};
