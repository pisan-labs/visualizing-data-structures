// Thompson's construction: a regular expression to an NFA, then a run on a word.
// Expressions use letters and digits, ε (or eps), ∅, | (union), * (zero or more),
// + (one or more), ? (optional) and parentheses.
#pragma once

#include <cctype>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

const std::string EPS = "ε";
const std::string EMPTY = "∅";

class ThompsonNfa {
 public:
  // Throws std::invalid_argument if the expression is not well formed.
  explicit ThompsonNfa(const std::string& regex) : tokens_(tokenize(regex)) {
    whole_ = unite();
    if (pos_ < tokens_.size()) throw std::invalid_argument("unexpected " + tokens_[pos_]);
  }

  int states() const { return static_cast<int>(moves_.size()); }

  int moveCount() const {
    int n = 0;
    for (const auto& out : moves_) n += static_cast<int>(out.size());
    return n;
  }

  bool accepts(const std::string& word) const {
    std::set<int> current = closure({whole_.start});
    for (char c : word) {
      std::set<int> next;
      for (int p : current)
        for (const Move& m : moves_[p])
          if (m.symbol == std::string(1, c)) next.insert(m.to);
      current = closure(next);
      if (current.empty()) return false;
    }
    return current.count(whole_.accept) > 0;
  }

 private:
  struct Move {
    std::string symbol;  // EPS for an ε-move
    int to;
  };
  // A piece of the NFA under construction: its start and accept states.
  struct Piece {
    int start, accept;
  };

  std::vector<std::vector<Move>> moves_;
  std::vector<std::string> tokens_;
  size_t pos_ = 0;
  Piece whole_{0, 0};

  // One token per character (ε and ∅ take several bytes); "eps" on its own (not inside a
  // word such as "steps") becomes ε, and spaces go.
  static std::vector<std::string> tokenize(const std::string& text) {
    auto alnum = [&](size_t j) {
      return j < text.size() && std::isalnum(static_cast<unsigned char>(text[j]));
    };
    std::vector<std::string> out;
    for (size_t i = 0; i < text.size();) {
      if (text.compare(i, 3, "eps") == 0 && (i == 0 || !alnum(i - 1)) && !alnum(i + 3)) {
        out.push_back(EPS);
        i += 3;
        continue;
      }
      unsigned char c = static_cast<unsigned char>(text[i]);
      size_t len = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4;
      if (!std::isspace(c)) out.push_back(text.substr(i, len));
      i += len;
    }
    return out;
  }

  std::set<int> closure(std::set<int> states) const {
    std::vector<int> todo(states.begin(), states.end());
    while (!todo.empty()) {
      int p = todo.back();
      todo.pop_back();
      for (const Move& m : moves_[p])
        if (m.symbol == EPS && states.insert(m.to).second) todo.push_back(m.to);
    }
    return states;
  }

  int newState() {
    moves_.emplace_back();
    return static_cast<int>(moves_.size()) - 1;
  }

  void add(int p, const std::string& symbol, int q) { moves_[p].push_back({symbol, q}); }

  std::string peek() const { return pos_ < tokens_.size() ? tokens_[pos_] : ""; }

  // A symbol, ε or ∅: two states, joined unless it is ∅.
  Piece piece(const std::string& symbol) {
    Piece p{newState(), newState()};
    if (symbol != EMPTY) add(p.start, symbol, p.accept);
    return p;
  }

  // Union: a new start and accept around both pieces.
  Piece either(Piece a, Piece b) {
    Piece p{newState(), newState()};
    add(p.start, EPS, a.start);
    add(p.start, EPS, b.start);
    add(a.accept, EPS, p.accept);
    add(b.accept, EPS, p.accept);
    return p;
  }

  Piece unite() {
    Piece p = concat();
    while (peek() == "|") {
      pos_++;
      Piece q = concat();
      p = either(p, q);
    }
    return p;
  }

  Piece concat() {
    bool any = false;
    Piece p{0, 0};
    while (pos_ < tokens_.size() && peek() != "|" && peek() != ")") {
      Piece next = postfix();
      if (any) {
        add(p.accept, EPS, next.start);
        p.accept = next.accept;
      } else {
        p = next;
        any = true;
      }
    }
    if (!any) throw std::invalid_argument("something is missing");
    return p;
  }

  Piece postfix() {
    Piece p = atom();
    while (peek() == "*" || peek() == "+" || peek() == "?") {
      std::string op = tokens_[pos_++];
      Piece loop{newState(), newState()};
      add(loop.start, EPS, p.start);
      if (op != "?") add(p.accept, EPS, p.start);  // repeat
      add(p.accept, EPS, loop.accept);
      if (op != "+") add(loop.start, EPS, loop.accept);  // skip
      p = loop;
    }
    return p;
  }

  Piece atom() {
    std::string t = peek();
    if (t == "(") {
      pos_++;
      Piece p = unite();
      if (peek() != ")") throw std::invalid_argument("a ( is never closed");
      pos_++;
      return p;
    }
    bool symbol = t.size() == 1 && std::isalnum(static_cast<unsigned char>(t[0]));
    if (t == EPS || t == EMPTY || symbol) {
      pos_++;
      return piece(t);
    }
    throw std::invalid_argument("unexpected " + t);
  }
};
