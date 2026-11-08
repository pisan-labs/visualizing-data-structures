"""f(n) = O(g(n)) when 0 <= f(n) <= c * g(n) for every n >= n0, for some c > 0 and n0.

A program can only try a finite range of n. These check a witness (c, n0) from n0 to n_max,
and find the smallest n0 that works for a c. Use a Fraction for c to compare exactly.
"""


def lg(n):
    """The floor of log2 n: how many times n halves before it reaches 1."""
    k = 0
    while n > 1:
        n //= 2
        k += 1
    return k


def holds(f, g, c, n):
    return 0 <= f(n) <= c * g(n)


def first_failure(f, g, c, n0, n_max):
    """The first n from n0 to n_max that breaks it, or None if none does."""
    for n in range(n0, n_max + 1):
        if not holds(f, g, c, n):
            return n
    return None


def smallest_n0(f, g, c, n_max):
    """The smallest n0 with nothing breaking it up to n_max: one past the last failure."""
    for n in range(n_max, 0, -1):
        if not holds(f, g, c, n):
            return n + 1 if n < n_max else None
    return 1
