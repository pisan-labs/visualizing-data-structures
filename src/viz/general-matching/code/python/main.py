# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order, "edge u v" adds an
# edge, and "match" prints "<size> | <matched pairs>".
import sys

from blossom import max_matching


def main():
    names, index, adj = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            adj = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            adj[v].append(u)
        elif op == "match":
            for a in adj:
                a.sort()
            mate = max_matching(adj)
            pairs = [f"{names[v]}-{names[mate[v]]}" for v in range(len(names)) if mate[v] > v]
            print(f"{len(pairs)} | {' '.join(pairs)}")


main()
