# Test driver: reads one operation per line, prints one result per line.
# "graph d|u <names>" numbers the vertices 0..n-1; "edge u v" adds an edge (an arc when d).
import sys

from euler import euler_path


def main():
    names, index, edges, directed = [], {}, [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "d"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            edges = []
        elif op == "edge":
            edges.append((index[args[0]], index[args[1]]))
        elif op == "euler":
            path = euler_path(len(names), edges, directed)
            print("none" if path is None else " ".join(names[v] for v in path))


main()
