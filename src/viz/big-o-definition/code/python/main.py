# Test driver: reads one operation per line, prints one result per line.
#   check p q n0 n_max ; F ; G   -> first n that breaks f <= (p/q)*g, or none
#   find p q n_max ; F ; G       -> smallest n0, or none
# F and G are terms k:a:b:e:x, meaning k * n^a * lg(n)^b * (2^n)^e * (n!)^x.
import sys
from fractions import Fraction
from math import factorial

from witness import first_failure, lg, smallest_n0


def function(terms):
    parts = [tuple(int(v) for v in t.split(":")) for t in terms.split()]

    def f(n):
        return sum(
            k * n**a * lg(n) ** b * 2 ** (e * n) * factorial(n) ** x for k, a, b, e, x in parts
        )

    return f


def main():
    out = []
    for line in sys.stdin:
        if not line.strip():
            continue
        head, f_terms, g_terms = line.split(";")
        words = head.split()
        f, g = function(f_terms), function(g_terms)
        if words[0] == "check":
            p, q, n0, n_max = map(int, words[1:])
            n = first_failure(f, g, Fraction(p, q), n0, n_max)
        else:
            p, q, n_max = map(int, words[1:])
            n = smallest_n0(f, g, Fraction(p, q), n_max)
        out.append("none" if n is None else str(n))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
