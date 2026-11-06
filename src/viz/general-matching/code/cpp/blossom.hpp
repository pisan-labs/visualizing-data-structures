#pragma once
#include <deque>
#include <vector>

// Maximum matching in a general graph: Edmonds' blossom algorithm.
// adj[v] lists v's neighbours in increasing order. Returns mate, where mate[v]
// is v's partner or -1.
class Blossom {
 public:
  static std::vector<int> max_matching(const std::vector<std::vector<int>>& adj) {
    Blossom b(adj);
    while (b.phase()) {
    }
    return b.mate_;
  }

 private:
  explicit Blossom(const std::vector<std::vector<int>>& adj)
      : adj_(adj), n_(static_cast<int>(adj.size())), mate_(n_, -1) {}

  // Grow an alternating forest from every free vertex; true if it augmented.
  bool phase() {
    even_.assign(n_, false);
    odd_.assign(n_, false);
    p_.assign(n_, -1);
    base_.resize(n_);
    root_.resize(n_);
    std::deque<int> queue;
    for (int v = 0; v < n_; v++) {
      base_[v] = root_[v] = v;
      if (mate_[v] == -1) {
        even_[v] = true;
        queue.push_back(v);
      }
    }
    while (!queue.empty()) {
      const int v = queue.front();
      queue.pop_front();
      for (int w : adj_[v]) {
        if (base_[v] == base_[w] || mate_[v] == w || odd_[w]) continue;
        if (!even_[w]) {  // w is matched and in no tree
          odd_[w] = true;
          p_[w] = v;
          const int m = mate_[w];
          even_[m] = true;
          root_[w] = root_[m] = root_[v];
          queue.push_back(m);
        } else if (root_[w] != root_[v]) {  // augmenting path
          flip(v);
          flip(w);
          mate_[v] = w;
          mate_[w] = v;
          return true;
        } else {  // a blossom: contract it into its base
          const int b = lca(v, w);
          std::vector<bool> in_blossom(n_, false);
          mark_path(v, b, w, in_blossom);
          mark_path(w, b, v, in_blossom);
          for (int x = 0; x < n_; x++) {
            if (!in_blossom[base_[x]]) continue;
            base_[x] = b;
            if (!even_[x]) {
              even_[x] = true;
              odd_[x] = false;
              queue.push_back(x);
            }
          }
        }
      }
    }
    return false;
  }

  int lca(int a, int b) const {
    std::vector<bool> seen(n_, false);
    while (true) {
      a = base_[a];
      seen[a] = true;
      if (mate_[a] == -1) break;
      a = p_[mate_[a]];
    }
    while (!seen[base_[b]]) b = p_[mate_[base_[b]]];
    return base_[b];
  }

  void mark_path(int v, int b, int child, std::vector<bool>& in_blossom) {
    while (base_[v] != b) {
      in_blossom[base_[v]] = in_blossom[base_[mate_[v]]] = true;
      p_[v] = child;
      child = mate_[v];
      v = p_[mate_[v]];
    }
  }

  // Flip the alternating path from even vertex e to its root.
  void flip(int e) {
    for (int m = mate_[e]; m != -1;) {
      const int pm = p_[m], next = mate_[pm];
      mate_[m] = pm;
      mate_[pm] = m;
      m = next;
    }
  }

  const std::vector<std::vector<int>>& adj_;
  int n_;
  std::vector<int> mate_, p_, base_, root_;
  std::vector<bool> even_, odd_;
};
