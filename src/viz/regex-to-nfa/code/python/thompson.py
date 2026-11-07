"""Thompson's construction: a regular expression to an NFA, then a run on a word.

Expressions use letters and digits, ε (or eps), ∅, | (union), * (zero or more),
+ (one or more), ? (optional) and parentheses.
"""

import re

EPS = "ε"


class NFA:
    def __init__(self):
        self.moves = []  # moves[q] lists (symbol, target); symbol EPS is an ε-move
        self.start = self.accept = None

    def new_state(self):
        self.moves.append([])
        return len(self.moves) - 1

    def add(self, p, symbol, q):
        self.moves[p].append((symbol, q))

    def closure(self, states):
        """Every state reachable from `states` by ε-moves alone."""
        seen, todo = set(states), list(states)
        while todo:
            for symbol, q in self.moves[todo.pop()]:
                if symbol == EPS and q not in seen:
                    seen.add(q)
                    todo.append(q)
        return seen

    def accepts(self, word):
        current = self.closure({self.start})
        for c in word:
            current = self.closure({q for p in current for s, q in self.moves[p] if s == c})
            if not current:
                return False
        return self.accept in current


def build(regex):
    """The NFA for regex. Raises ValueError if the expression is not well formed."""
    text = re.sub(r"\beps\b", EPS, regex).replace(" ", "")  # eps on its own is ε
    nfa = NFA()
    pos = 0

    def peek():
        return text[pos] if pos < len(text) else ""

    def piece(symbol):  # a symbol, ε or ∅: two states, joined unless it is ∅
        s, f = nfa.new_state(), nfa.new_state()
        if symbol != "∅":
            nfa.add(s, symbol, f)
        return s, f

    def either(a, b):  # union: a new start and accept around both pieces
        s, f = nfa.new_state(), nfa.new_state()
        for p, q in ((s, a[0]), (s, b[0]), (a[1], f), (b[1], f)):
            nfa.add(p, EPS, q)
        return s, f

    def union():
        nonlocal pos
        frag = concat()
        while peek() == "|":
            pos += 1
            frag = either(frag, concat())
        return frag

    def concat():
        frag = None
        while peek() not in ("", "|", ")"):
            nxt = postfix()
            if frag:
                nfa.add(frag[1], EPS, nxt[0])
                frag = (frag[0], nxt[1])
            else:
                frag = nxt
        if not frag:
            raise ValueError("something is missing")
        return frag

    def postfix():
        nonlocal pos
        frag = atom()
        while peek() in ("*", "+", "?"):
            op = peek()
            pos += 1
            s, f = nfa.new_state(), nfa.new_state()
            nfa.add(s, EPS, frag[0])
            if op != "?":
                nfa.add(frag[1], EPS, frag[0])  # repeat
            nfa.add(frag[1], EPS, f)
            if op != "+":
                nfa.add(s, EPS, f)  # skip
            frag = (s, f)
        return frag

    def atom():
        nonlocal pos
        c = peek()
        if c == "(":
            pos += 1
            frag = union()
            if peek() != ")":
                raise ValueError("a ( is never closed")
            pos += 1
            return frag
        if c in (EPS, "∅") or (c.isascii() and c.isalnum()):
            pos += 1
            return piece(c)
        raise ValueError(f"unexpected {c!r}")

    nfa.start, nfa.accept = union()
    if pos < len(text):
        raise ValueError(f"unexpected {peek()!r}")
    return nfa
