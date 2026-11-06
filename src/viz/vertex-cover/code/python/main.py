# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "edge u v w" adds an edge.
import sys

from vertex_cover import approx_vertex_cover, min_cover_size


def main():
    names, index, edges = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            edges = []
        elif op == "edge":
            edges.append((index[args[0]], index[args[1]]))
        elif op == "cover":
            cover = approx_vertex_cover(edges)
            shown = " ".join(names[v] for v in cover) or "-"
            print(shown, "|", min_cover_size(len(names), edges))


main()
