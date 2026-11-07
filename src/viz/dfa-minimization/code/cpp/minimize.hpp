#pragma once
#include <map>
#include <set>
#include <vector>

// Moore's partition refinement. States are 0..n-1; a dead state, if one is needed, is n.
struct Minimized {
  std::vector<std::vector<int>> blocks;  // equivalent states, in the order of their first state
  std::vector<std::vector<int>> moves;   // moves[i][c]: the block block i goes to on symbol c
};

// delta[q][c] is the state q goes to on symbol c, or -1 for a missing move.
inline Minimized minimize(std::vector<std::vector<int>> delta, int symbols, int start,
                          const std::vector<bool>& accept) {
  int n = static_cast<int>(delta.size());
  // Complete the DFA: a dead state takes every missing move.
  bool missing = false;
  for (auto& row : delta)
    for (int& t : row)
      if (t < 0) {
        t = n;
        missing = true;
      }
  if (missing) delta.push_back(std::vector<int>(symbols, n));
  // Keep only the states the start can reach.
  std::vector<bool> seen(delta.size(), false);
  std::vector<int> stack{start};
  seen[start] = true;
  while (!stack.empty()) {
    int q = stack.back();
    stack.pop_back();
    for (int t : delta[q])
      if (!seen[t]) {
        seen[t] = true;
        stack.push_back(t);
      }
  }
  std::vector<int> states;
  for (int q = 0; q < static_cast<int>(delta.size()); q++)
    if (seen[q]) states.push_back(q);
  // Start from {F, Q - F}; split blocks by signature until nothing splits.
  std::vector<int> block(delta.size(), 0);
  for (int q : states) block[q] = q < n && accept[q] ? 1 : 0;
  for (;;) {
    std::map<std::vector<int>, int> ids;
    std::set<int> before;
    std::vector<int> next(delta.size(), 0);
    for (int q : states) {
      before.insert(block[q]);
      std::vector<int> sig{block[q]};
      for (int t : delta[q]) sig.push_back(block[t]);
      auto it = ids.emplace(sig, static_cast<int>(ids.size())).first;
      next[q] = it->second;
    }
    block = next;
    if (ids.size() == before.size()) break;
  }
  Minimized m;
  std::map<int, int> blockIndex;  // block id -> position, in the order of first states
  std::vector<int> index(delta.size(), 0);
  for (int q : states) {
    auto it = blockIndex.emplace(block[q], static_cast<int>(m.blocks.size())).first;
    if (it->second == static_cast<int>(m.blocks.size())) m.blocks.push_back({});
    m.blocks[it->second].push_back(q);
    index[q] = it->second;
  }
  for (auto& b : m.blocks) {
    std::vector<int> row;
    for (int t : delta[b[0]]) row.push_back(index[t]);
    m.moves.push_back(row);
  }
  return m;
}
