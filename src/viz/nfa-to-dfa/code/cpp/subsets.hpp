#pragma once
#include <map>
#include <queue>
#include <vector>

// Sipser's subset construction, breadth first from the start set. NFA states are 0..n-1 and a
// set of them is a bit mask: bit q is set when q is in the set.
struct Subsets {
  std::vector<unsigned> sets;            // the DFA's states, in the order they are found
  std::vector<std::vector<int>> delta;   // delta[i][c]: the state set i goes to on symbol c
  std::vector<bool> accepts;             // set i holds an accept state of the NFA
};

// The ε-closure: the set, plus every state its ε-moves reach.
inline unsigned closure(const std::vector<std::vector<int>>& eps, unsigned set) {
  std::vector<int> stack;
  for (int q = 0; q < static_cast<int>(eps.size()); q++)
    if (set >> q & 1u) stack.push_back(q);
  while (!stack.empty()) {
    int q = stack.back();
    stack.pop_back();
    for (int r : eps[q])
      if (!(set >> r & 1u)) {
        set |= 1u << r;
        stack.push_back(r);
      }
  }
  return set;
}

// moves[q][c] lists the states q goes to on symbol c, and eps[q] the states its ε-moves reach.
inline Subsets subsetConstruction(const std::vector<std::vector<std::vector<int>>>& moves,
                                  const std::vector<std::vector<int>>& eps, int symbols,
                                  int start, unsigned accept) {
  Subsets d;
  std::map<unsigned, int> index;
  std::queue<unsigned> queue;
  unsigned first = closure(eps, 1u << start);
  index[first] = 0;
  d.sets.push_back(first);
  queue.push(first);
  while (!queue.empty()) {
    unsigned t = queue.front();
    queue.pop();
    std::vector<int> row(symbols);
    for (int c = 0; c < symbols; c++) {
      unsigned m = 0;
      for (int q = 0; q < static_cast<int>(moves.size()); q++)
        if (t >> q & 1u)
          for (int r : moves[q][c]) m |= 1u << r;
      unsigned u = closure(eps, m);
      auto it = index.find(u);
      if (it == index.end()) {
        it = index.emplace(u, static_cast<int>(d.sets.size())).first;
        d.sets.push_back(u);
        queue.push(u);
      }
      row[c] = it->second;
    }
    d.delta.push_back(row);
  }
  for (unsigned set : d.sets) d.accepts.push_back((set & accept) != 0);
  return d;
}
