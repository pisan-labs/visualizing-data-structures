#pragma once
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

// Brzozowski derivatives of regular expressions.
//
// An expression's kind is 's' (the symbol c), 'e' (ε), '0' (∅), '|' (union), '.'
// (concatenation), '*', '+' (one or more) or '?' (optional); a and b are its parts.
struct Rx;
using R = std::shared_ptr<const Rx>;
struct Rx {
    char kind;
    R a, b;
    char c = 0;
};

inline R make(char kind, R a = nullptr, R b = nullptr, char c = 0) {
    return std::make_shared<const Rx>(Rx{kind, std::move(a), std::move(b), c});
}
inline const R EMPTY = make('0');
inline const R EPS = make('e');

inline int prec(const R& r) {
    switch (r->kind) {
        case '|': return 0;
        case '.': return 1;
        case '*': case '+': case '?': return 2;
        default: return 3;
    }
}

// The expression's text, with only the parentheses it needs.
inline std::string show(const R& r) {
    auto wrap = [](const R& s, int least) { return prec(s) < least ? "(" + show(s) + ")" : show(s); };
    switch (r->kind) {
        case 's': return std::string(1, r->c);
        case 'e': return "ε";
        case '0': return "∅";
        case '|': return wrap(r->a, 0) + "|" + wrap(r->b, 1);
        case '.': return wrap(r->a, 1) + wrap(r->b, 1);
        default: return wrap(r->a, 3) + r->kind;  // *, + or ?
    }
}

// Does r match the empty word?
inline bool nullable(const R& r) {
    switch (r->kind) {
        case 'e': case '*': case '?': return true;
        case '0': case 's': return false;
        case '|': return nullable(r->a) || nullable(r->b);
        case '.': return nullable(r->a) && nullable(r->b);
        default: return nullable(r->a);  // r+
    }
}

// Smart constructors: they simplify as they build.

inline void alternatives(const R& r, std::vector<R>& out) {
    if (r->kind == '|') {
        alternatives(r->a, out);
        alternatives(r->b, out);
    } else {
        out.push_back(r);
    }
}

// r|s, with ∅ dropped and the alternatives sorted by their text, without repeats.
inline R alt(const R& r, const R& s) {
    std::vector<R> all;
    alternatives(r, all);
    alternatives(s, all);
    std::map<std::string, R> alts;
    for (const R& x : all)
        if (x->kind != '0') alts[show(x)] = x;
    R out = EMPTY;
    for (const auto& entry : alts) out = out->kind == '0' ? entry.second : make('|', out, entry.second);
    return out;
}

inline R cat(const R& r, const R& s) {
    if (r->kind == '0' || s->kind == '0') return EMPTY;
    if (r->kind == 'e') return s;
    if (s->kind == 'e') return r;
    if (r->kind == '.') return cat(r->a, cat(r->b, s));  // r(st), not (rs)t
    return make('.', r, s);
}

inline R star(const R& r) {
    if (r->kind == '0' || r->kind == 'e') return EPS;
    return r->kind == '*' ? r : make('*', r);
}

inline R simplify(const R& r) {
    switch (r->kind) {
        case '|': return alt(simplify(r->a), simplify(r->b));
        case '.': return cat(simplify(r->a), simplify(r->b));
        case '*': return star(simplify(r->a));
        case '+': case '?': return make(r->kind, simplify(r->a));
        default: return r;
    }
}

// What is left of r after reading the symbol c.
inline R derive(const R& r, char c) {
    switch (r->kind) {
        case 'e': case '0': return EMPTY;
        case 's': return r->c == c ? EPS : EMPTY;
        case '|': return alt(derive(r->a, c), derive(r->b, c));
        case '.': {
            R left = cat(derive(r->a, c), simplify(r->b));
            return nullable(r->a) ? alt(left, derive(r->b, c)) : left;
        }
        case '*': return cat(derive(r->a, c), simplify(r));
        case '+': return cat(derive(r->a, c), star(simplify(r->a)));
        default: return derive(r->a, c);  // r?
    }
}

// Takes one derivative per symbol; the word matches if what is left matches ε.
inline bool matches(R r, const std::string& word) {
    r = simplify(r);
    for (char c : word) {
        if (r->kind == '0') return false;
        r = derive(r, c);
    }
    return nullable(r);
}

inline void symbols(const R& r, std::set<char>& out) {
    if (!r) return;
    if (r->kind == 's') out.insert(r->c);
    symbols(r->a, out);
    symbols(r->b, out);
}

// The DFA whose states are the derivatives of r: {states, accepting}, or nothing if too many.
inline std::optional<std::pair<int, int>> dfa(const R& r, std::size_t maxStates = 8) {
    std::vector<R> states{simplify(r)};
    std::set<std::string> seen{show(states[0])};
    std::set<char> alphabet;
    symbols(states[0], alphabet);
    for (std::size_t i = 0; i < states.size(); i++)
        for (char c : alphabet) {
            R d = derive(states[i], c);
            if (seen.count(show(d))) continue;
            if (states.size() == maxStates) return std::nullopt;
            seen.insert(show(d));
            states.push_back(d);
        }
    int accepting = 0;
    for (const R& q : states) accepting += nullable(q) ? 1 : 0;
    return std::make_pair(static_cast<int>(states.size()), accepting);
}
