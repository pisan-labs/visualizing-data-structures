#pragma once
#include <algorithm>
#include <map>
#include <set>
#include <string>
#include <utility>
#include <vector>

// A DFA with named states. delta[{q, c}] is where q goes on c; a missing move rejects.
struct Dfa {
  std::vector<std::string> states, alphabet;
  std::string start;
  std::set<std::string> accept;
  std::map<std::pair<std::string, std::string>, std::string> delta;

  bool has(const std::string& q) const {
    return std::find(states.begin(), states.end(), q) != states.end();
  }
};

// The same DFA with a dead state taking every missing move.
inline Dfa complete(const Dfa& m) {
  std::string dead = "dead";
  for (int i = 2; m.has(dead); i++) dead = "dead" + std::to_string(i);
  Dfa out = m;
  out.states.push_back(dead);
  bool missing = false;
  for (const auto& q : out.states)
    for (const auto& c : m.alphabet)
      if (!out.delta.count({q, c})) {
        out.delta[{q, c}] = dead;
        missing = missing || q != dead;
      }
  return missing ? out : m;
}

// Complete it, then accept exactly where it did not.
inline Dfa complement(const Dfa& m) {
  Dfa out = complete(m);
  std::set<std::string> flipped;
  for (const auto& q : out.states)
    if (!out.accept.count(q)) flipped.insert(q);
  out.accept = flipped;
  return out;
}

// Which pairs accept, given whether p accepts in A (x) and q accepts in B (y).
inline bool accepts(const std::string& op, bool x, bool y) {
  if (op == "union") return x || y;
  if (op == "intersection") return x && y;
  if (op == "difference") return x && !y;
  return x != y;  // symmetric difference
}

// Sipser's product construction, building only the pairs reachable from the start pair. A and B
// read the same alphabet. The pair (p, q) is the state "p,q"; on c it goes to the pair of A's
// move from p and B's move from q.
inline Dfa product(const Dfa& a0, const Dfa& b0, const std::string& op) {
  Dfa a = complete(a0), b = complete(b0), m;
  auto name = [](const std::string& p, const std::string& q) { return p + "," + q; };
  std::vector<std::pair<std::string, std::string>> pairs{{a.start, b.start}};
  m.alphabet = a.alphabet;
  m.start = name(a.start, b.start);
  m.states.push_back(m.start);
  for (std::size_t i = 0; i < pairs.size(); i++) {  // pairs doubles as the queue
    auto [p, q] = pairs[i];
    for (const auto& c : a.alphabet) {
      std::string p2 = a.delta.at({p, c}), q2 = b.delta.at({q, c});
      std::string r = name(p2, q2);
      if (!m.has(r)) {
        m.states.push_back(r);
        pairs.push_back({p2, q2});
      }
      m.delta[{name(p, q), c}] = r;
    }
  }
  for (const auto& [p, q] : pairs)
    if (accepts(op, a.accept.count(p) > 0, b.accept.count(q) > 0)) m.accept.insert(name(p, q));
  return m;
}
