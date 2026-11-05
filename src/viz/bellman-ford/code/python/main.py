# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from bellman_ford import bellman_ford


def main():
    names, index, edges, directed = [], {}, [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "directed"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            edges = []
        elif op == "edge":
            u, v, w = index[args[0]], index[args[1]], int(args[2])
            edges.append((u, v, w))
            if not directed:
                edges.append((v, u, w))
        elif op == "bellman-ford":
            edges.sort()
            d, pi, cycle = bellman_ford(len(names), edges, index[args[0]])
            out = [
                " ".join("inf" if x is None else str(x) for x in d),
                " ".join("-" if p is None else names[p] for p in pi),
            ]
            if cycle is not None:
                k = cycle.index(min(cycle))
                cycle = cycle[k:] + cycle[:k]
                out.append("negative cycle " + " ".join(names[x] for x in cycle))
            print(" | ".join(out))


main()
