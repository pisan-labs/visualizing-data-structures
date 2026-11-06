# Test driver: reads one operation per line, prints one result per line.
# "left <names>" and "right <names>" number each side 0..n-1 in that order; "edge u v" joins
# left vertex u to right vertex v.
import sys

from matching import max_matching


def main():
    left, right, li, ri, adj = [], [], {}, {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "left":
            left = args
            li = {name: i for i, name in enumerate(left)}
            adj = [[] for _ in left]
        elif op == "right":
            right = args
            ri = {name: i for i, name in enumerate(right)}
        elif op == "edge":
            adj[li[args[0]]].append(ri[args[1]])
        elif op == "match":
            for a in adj:
                a.sort()
            size, match_r = max_matching(adj, len(right))
            mate = {u: v for v, u in enumerate(match_r) if u is not None}
            pairs = " ".join(f"{left[u]}-{right[mate[u]]}" for u in range(len(left)) if u in mate)
            print(f"{size} | {pairs}".rstrip())


main()
