# Test driver: reads one operation per line, prints one result per line.
# "add <words>" indexes a document (no output); "clear" starts again;
# "search <k1> <b> rsj|plus1 <words>" prints the best three as "d<id> <score>" pairs,
# best first, three decimals, or "none".
import math
import sys

from bm25 import InvertedIndex


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    idx = InvertedIndex()
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "add":
            idx.add(p[1:])
        elif p[0] == "clear":
            idx = InvertedIndex()
        elif p[0] == "search":
            top = idx.search(p[4:], float(p[1]), float(p[2]), p[3])
            print(" ".join(f"d{doc} {three(score)}" for doc, score in top) if top else "none")


main()
