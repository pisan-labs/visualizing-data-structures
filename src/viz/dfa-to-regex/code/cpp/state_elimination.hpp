// Sipser's state elimination: from a DFA to a regular expression.
#pragma once
#include <iterator>
#include <map>
#include <string>
#include <utility>
#include <vector>

// A label and its kind, so we know where parentheses go.
enum class Kind { Empty, Eps, Sym, Star, Concat, Union };

struct Label {
  std::string text;
  Kind kind;
};

inline const Label EMPTY{"∅", Kind::Empty};
inline const Label EPS{"ε", Kind::Eps};

// The constructors simplify with R∅ = ∅, Rε = R, R ∪ ∅ = R, ε* = ε and ∅* = ε.
inline Label unite(const Label& x, const Label& y) {
  if (x.kind == Kind::Empty) return y;
  if (y.kind == Kind::Empty) return x;
  return {x.text + "∪" + y.text, Kind::Union};
}

inline Label concat(const Label& x, const Label& y) {
  if (x.kind == Kind::Empty || y.kind == Kind::Empty) return EMPTY;
  if (x.kind == Kind::Eps) return y;
  if (y.kind == Kind::Eps) return x;
  auto part = [](const Label& r) { return r.kind == Kind::Union ? "(" + r.text + ")" : r.text; };
  return {part(x) + part(y), Kind::Concat};
}

inline Label star(const Label& x) {
  if (x.kind == Kind::Empty || x.kind == Kind::Eps) return EPS;
  return {(x.kind == Kind::Sym ? x.text : "(" + x.text + ")") + "*", Kind::Star};
}

struct Move {
  std::string from, on, to;
};

// states: the DFA's states in the order to rip them. Returns the expression's text.
inline std::string toRegex(const std::vector<std::string>& states, const std::string& start,
                           const std::vector<std::string>& accept,
                           const std::vector<Move>& moves) {
  using Pair = std::pair<std::string, std::string>;
  const std::string s = "<s>", f = "<f>";  // the new start and accept; no DFA state is named so
  std::map<Pair, Label> label;             // a missing pair means ∅
  auto get = [&](const Pair& k) {
    auto it = label.find(k);
    return it == label.end() ? EMPTY : it->second;
  };
  auto add = [&](const Pair& k, const Label& r) {
    Label x = unite(get(k), r);
    label.insert_or_assign(k, x);
  };
  add({s, start}, EPS);
  for (const Move& m : moves) add({m.from, m.to}, {m.on, Kind::Sym});  // a∪b for parallel moves
  for (const std::string& q : accept) add({q, f}, EPS);
  for (const std::string& rip : states) {
    Label loop = star(get({rip, rip}));
    std::vector<std::string> ins, outs;
    for (const auto& [k, r] : label) {
      if (k.second == rip && k.first != rip) ins.push_back(k.first);
      if (k.first == rip && k.second != rip) outs.push_back(k.second);
    }
    for (const std::string& p : ins)
      for (const std::string& q : outs) {
        Label path = concat(concat(get({p, rip}), loop), get({rip, q}));
        label.insert_or_assign(Pair{p, q}, unite(path, get({p, q})));  // R1(R2)*R3 ∪ R4
      }
    for (auto it = label.begin(); it != label.end();)
      it = it->first.first == rip || it->first.second == rip ? label.erase(it) : std::next(it);
  }
  return get({s, f}).text;
}
