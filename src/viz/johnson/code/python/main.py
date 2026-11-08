# Test driver: reads one operation per line, prints one result per line.
# "graph d|u <names>" numbers the vertices 0..n-1; "edge u v w" adds an arc (two when u).
# "johnson" prints the matrix rows separated by |, INF for no path, or "negative cycle".
import sys

from johnson import INF, johnson


def main():
    names, index, arcs, directed = [], {}, [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "d"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            arcs = []
        elif op == "edge":
            u, v, w = index[args[0]], index[args[1]], int(args[2])
            arcs.append((u, v, w))
            if not directed:
                arcs.append((v, u, w))
        elif op == "johnson":
            dist = johnson(len(names), arcs)
            if dist is None:
                print("negative cycle")
            else:
                print(" | ".join(" ".join("INF" if x == INF else str(x) for x in row) for row in dist))


main()
