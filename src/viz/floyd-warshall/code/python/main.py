# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from floyd_warshall import floyd_warshall, path


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
        elif op == "floyd":
            d, pi = floyd_warshall(len(names), edges)
            out = [
                "; ".join(" ".join("inf" if x is None else str(x) for x in row) for row in d),
                "; ".join(" ".join("-" if p is None else names[p] for p in row) for row in pi),
            ]
            negative = [names[v] for v in range(len(names)) if d[v][v] < 0]
            if negative:
                out.append("negative cycle " + " ".join(negative))
            print(" | ".join(out))
        elif op == "path":
            d, pi = floyd_warshall(len(names), edges)
            i, j = index[args[0]], index[args[1]]
            # A pair that can pass through a negative cycle has no shortest path.
            broken = any(
                d[x][x] < 0 and d[i][x] is not None and d[x][j] is not None
                for x in range(len(names))
            )
            if broken:
                print("negative cycle")
            elif d[i][j] is None:
                print("no path")
            else:
                print(" ".join(names[v] for v in path(pi, i, j)))


main()
