# Test driver: reads one operation per line, prints one result per line.
# "graph undirected <names>" numbers the vertices 0..n-1 in that order; "edge u v" adds u-v.
import sys

from bridges import cuts_and_bridges


def main():
    names, index, adj, edges = [], {}, [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            adj, edges = [[] for _ in names], []
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            edges.append((u, v))
            adj[u].append(v)
            adj[v].append(u)
        elif op == "cuts":
            for a in adj:
                a.sort()
            cuts, bridges = cuts_and_bridges(adj)
            found = {frozenset(b) for b in bridges}
            listed = [f"{names[u]}-{names[v]}" for u, v in edges if frozenset((u, v)) in found]
            print(" ".join(names[c] for c in cuts) or "-", "|", " ".join(listed) or "-")


main()
