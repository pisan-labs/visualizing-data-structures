# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
# Components ignore direction, so every edge goes in both lists.
import sys

from components import connected_components


def main():
    index, adj = {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            index = {name: i for i, name in enumerate(args[1:])}
            adj = [[] for _ in index]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            adj[v].append(u)
        elif op == "components":
            for a in adj:
                a.sort()
            count, cc = connected_components(adj)
            print(count, "|", " ".join(str(c) for c in cc))


main()
