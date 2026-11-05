# Test driver: reads one operation per line, prints one result per line.
# "graph directed <names>" numbers the vertices 0..n-1 in that order; "edge u v" adds u -> v.
import sys

from topo import CycleError, topological_sort


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
            adj[index[args[0]]].append(index[args[1]])
        elif op == "topo":
            for a in adj:
                a.sort()
            try:
                print(" ".join(names[u] for u in topological_sort(adj)))
            except CycleError as e:
                print("cycle", names[e.u], names[e.v])


main()
