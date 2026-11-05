# Test driver: reads one operation per line, prints one result per line.
# "graph directed <names>" numbers the vertices 0..n-1 in that order; "edge u v" is u -> v.
import sys

from topo import topological_sort


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
        elif op == "sort":
            for a in adj:
                a.sort()
            order = topological_sort(adj)
            done = set(order)
            left = [names[v] for v in range(len(names)) if v not in done]
            line = " ".join(names[v] for v in order) + " | " + (" ".join(left) or "-")
            print(line.strip())


main()
