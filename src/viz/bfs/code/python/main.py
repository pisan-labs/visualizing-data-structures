# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from bfs import bfs


def main():
    names, index, adj, directed = [], {}, [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "directed"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            adj = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            if not directed:
                adj[v].append(u)
        elif op == "bfs":
            for a in adj:
                a.sort()
            order, d, pi = bfs(adj, index[args[0]])
            print(
                " ".join(names[u] for u in order),
                "|",
                " ".join("inf" if x is None else str(x) for x in d),
                "|",
                " ".join("-" if p is None else names[p] for p in pi),
            )


main()
