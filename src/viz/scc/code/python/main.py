# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from scc import strongly_connected_components


def main():
    names, index, adj, directed = [], {}, [], True
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
        elif op == "scc":
            for a in adj:
                a.sort()
            components = strongly_connected_components(adj)
            print(" | ".join(" ".join(names[v] for v in c) for c in components))


main()
