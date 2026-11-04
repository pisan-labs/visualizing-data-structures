# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from dijkstra import dijkstra


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
            u, v, w = index[args[0]], index[args[1]], int(args[2])
            adj[u].append((v, w))
            if not directed:
                adj[v].append((u, w))
        elif op == "dijkstra":
            for a in adj:
                a.sort()
            try:
                d, pi = dijkstra(adj, index[args[0]])
            except ValueError:
                print("negative edge")
                continue
            print(
                " ".join("inf" if x is None else str(x) for x in d),
                "|",
                " ".join("-" if p is None else names[p] for p in pi),
            )


main()
