"""Brzozowski derivatives of regular expressions.

An expression is a tuple: ("sym", "a"), ("eps",), ("empty",), ("|", r, s) for union,
(".", r, s) for concatenation, ("*", r), ("+", r) for one or more and ("?", r) for optional.
"""

EMPTY = ("empty",)
EPS = ("eps",)
PREC = {"|": 0, ".": 1, "*": 2, "+": 2, "?": 2, "sym": 3, "eps": 3, "empty": 3}


def show(r):
    """The expression's text, with only the parentheses it needs."""

    def wrap(s, least):
        return f"({show(s)})" if PREC[s[0]] < least else show(s)

    kind = r[0]
    if kind == "sym":
        return r[1]
    if kind == "eps":
        return "ε"
    if kind == "empty":
        return "∅"
    if kind == "|":
        return wrap(r[1], 0) + "|" + wrap(r[2], 1)
    if kind == ".":
        return wrap(r[1], 1) + wrap(r[2], 1)
    return wrap(r[1], 3) + kind  # *, + or ?


def nullable(r):
    """Does r match the empty word?"""
    kind = r[0]
    if kind in ("eps", "*", "?"):
        return True
    if kind in ("empty", "sym"):
        return False
    if kind == "|":
        return nullable(r[1]) or nullable(r[2])
    if kind == ".":
        return nullable(r[1]) and nullable(r[2])
    return nullable(r[1])  # r+


# Smart constructors: they simplify as they build.


def alternatives(r):
    return alternatives(r[1]) + alternatives(r[2]) if r[0] == "|" else [r]


def union(r, s):
    """r|s, with ∅ dropped and the alternatives sorted by their text, without repeats."""
    alts = {show(x): x for x in alternatives(r) + alternatives(s) if x != EMPTY}
    out = EMPTY
    for text in sorted(alts):
        out = alts[text] if out == EMPTY else ("|", out, alts[text])
    return out


def concat(r, s):
    if EMPTY in (r, s):
        return EMPTY
    if r == EPS:
        return s
    if s == EPS:
        return r
    if r[0] == ".":  # keep it nested to the right: (rs)t is r(st)
        return concat(r[1], concat(r[2], s))
    return (".", r, s)


def star(r):
    if r in (EMPTY, EPS):
        return EPS
    return r if r[0] == "*" else ("*", r)


def simplify(r):
    kind = r[0]
    if kind == "|":
        return union(simplify(r[1]), simplify(r[2]))
    if kind == ".":
        return concat(simplify(r[1]), simplify(r[2]))
    if kind == "*":
        return star(simplify(r[1]))
    if kind in ("+", "?"):
        return (kind, simplify(r[1]))
    return r


def derive(r, c):
    """What is left of r after reading the symbol c."""
    kind = r[0]
    if kind in ("eps", "empty"):
        return EMPTY
    if kind == "sym":
        return EPS if r[1] == c else EMPTY
    if kind == "|":
        return union(derive(r[1], c), derive(r[2], c))
    if kind == ".":
        left = concat(derive(r[1], c), simplify(r[2]))
        return union(left, derive(r[2], c)) if nullable(r[1]) else left
    if kind == "*":
        return concat(derive(r[1], c), simplify(r))
    if kind == "+":
        return concat(derive(r[1], c), star(simplify(r[1])))
    return derive(r[1], c)  # r?


def matches(r, word):
    """Take one derivative per symbol; the word matches if what is left matches ε."""
    r = simplify(r)
    for c in word:
        if r == EMPTY:
            return False
        r = derive(r, c)
    return nullable(r)


def symbols(r):
    if r[0] == "sym":
        return {r[1]}
    return set().union(*(symbols(s) for s in r[1:] if isinstance(s, tuple)))


def dfa(r, max_states=8):
    """The DFA whose states are the derivatives of r: (states, accepting), or None if too many."""
    states = [simplify(r)]
    index = {show(states[0])}
    alphabet = sorted(symbols(states[0]))
    i = 0
    while i < len(states):
        for c in alphabet:
            d = derive(states[i], c)
            if show(d) not in index:
                if len(states) == max_states:
                    return None
                index.add(show(d))
                states.append(d)
        i += 1
    return len(states), sum(1 for q in states if nullable(q))
