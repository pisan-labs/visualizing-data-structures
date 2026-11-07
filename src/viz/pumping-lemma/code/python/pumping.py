# The pumping lemma game: membership tests, legal splits, pumping, and both players' searches.
# A split is the lengths of its pieces: [x, y, z] (regular) or [u, v, x, y, z] (context-free).
import re
from math import isqrt

MAX_I = 5  # the largest i either player uses


def is_prime(n):
    return n >= 2 and all(n % d for d in range(2, isqrt(n) + 1))


def balanced(w):
    depth = 0
    for c in w:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


MEMBER = {
    "anbn": lambda w: re.fullmatch(r"a*b*", w) is not None and w.count("a") == w.count("b"),
    "paren": balanced,
    "wwr": lambda w: len(w) % 2 == 0 and w == w[::-1],
    "ww": lambda w: len(w) % 2 == 0 and w[: len(w) // 2] == w[len(w) // 2 :],
    "anbncn": lambda w: re.fullmatch(r"a*b*c*", w) is not None
    and w.count("a") == w.count("b") == w.count("c"),
    "squares": lambda w: set(w) <= {"a"} and isqrt(len(w)) ** 2 == len(w),
    "primes": lambda w: set(w) <= {"a"} and is_prime(len(w)),
    "abstar": lambda w: re.fullmatch(r"(ab)*", w) is not None,
    "astarbstar": lambda w: re.fullmatch(r"a*b*", w) is not None,
}

PUMPED = {"regular": (1,), "cf": (1, 3)}  # the pieces that pump: y, or v and y


def splits(n, p, lemma):
    """Every legal split of a string of length n, x (or u) first."""
    if lemma == "regular":  # |xy| <= p, |y| >= 1
        for x in range(min(p, n)):
            for y in range(1, min(p, n) - x + 1):
                yield [x, y, n - x - y]
        return
    for u in range(n):  # |vxy| <= p, |vy| >= 1
        for v in range(p + 1):
            for x in range(p - v + 1):
                for y in range(p - v - x + 1):
                    if v + y > 0 and u + v + x + y <= n:
                        yield [u, v, x, y, n - u - v - x - y]


def pump(s, parts, i, lemma):
    out, at = [], 0
    for k, size in enumerate(parts):
        piece = s[at : at + size]
        out.append(piece * i if k in PUMPED[lemma] else piece)
        at += size
    return "".join(out)


def adversary(lang, s, p, lemma):
    """Try every split; keep one that stays in L for every i, else the one that lasts longest."""
    member = MEMBER[lang]
    best, best_score, count, survivors = None, -1, 0, 0
    for parts in splits(len(s), p, lemma):
        score = sum(member(pump(s, parts, i, lemma)) for i in range(MAX_I + 1))
        count += 1
        survivors += score == MAX_I + 1
        if score > best_score:
            best, best_score = parts, score
    return count, survivors, best


def prover(lang, s, parts, lemma):
    """The first i that pumps s out of L, or None if the split survives them all."""
    for i in (0, 2, 3, 4, 5):
        if not MEMBER[lang](pump(s, parts, i, lemma)):
            return i
    return None
