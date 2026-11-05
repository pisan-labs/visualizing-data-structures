# Test driver: reads one operation per line, prints one result per line.
# "build T" prints "<SA> | <LCP>", "search T P" the positions of P (or "none"),
# "repeat T" the longest repeated substring (or "none").
import sys

from suffix_array import lcp_array, longest_repeat, search, suffix_array


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, t = parts[0], parts[1]
        sa = suffix_array(t)
        lcp = lcp_array(t, sa)
        if op == "build":
            print(" ".join(map(str, sa)), "|", " ".join(map(str, lcp)))
        elif op == "search":
            found = search(t, sa, parts[2])
            print(" ".join(map(str, found)) if found else "none")
        elif op == "repeat":
            print(longest_repeat(t, sa, lcp) or "none")


main()
