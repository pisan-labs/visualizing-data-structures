# Test driver: reads one operation per line, prints one result per line.
# Vertices are named on the "graph" line; the classes number them 0..n-1 in that order.
import sys

from representations import AdjacencyList, AdjacencyMatrix


def main():
    names, index, both = [], {}, []
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "directed"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            both = [AdjacencyList(len(names), directed), AdjacencyMatrix(len(names), directed)]
            continue
        u = index[args[0]]
        if op == "edge":
            for g in both:
                g.add_edge(u, index[args[1]])
        elif op == "has":
            out.append(" ".join("yes" if g.has_edge(u, index[args[1]]) else "no" for g in both))
        elif op == "add":
            out.append(" ".join("added" if g.add_edge(u, index[args[1]]) else "exists" for g in both))
        elif op == "remove":
            out.append(
                " ".join("removed" if g.remove_edge(u, index[args[1]]) else "missing" for g in both)
            )
        elif op == "neighbours":
            lists = [" ".join(names[v] for v in g.neighbours(u)) or "none" for g in both]
            out.append(" / ".join(lists))
    for result in out:
        print(result)


main()
