# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
# Sides ignore direction, so every edge goes in both lists.
import sys

from bipartite import bipartite


def main():
    names, index, adj = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            adj = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            adj[v].append(u)
        elif op == "check":
            for a in adj:
                a.sort()
            ok, result = bipartite(adj)
            if ok:
                print("yes |", " ".join(str(x) for x in result))
            else:
                print("no |", " ".join(names[x] for x in result))


main()
