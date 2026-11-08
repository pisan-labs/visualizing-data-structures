# Test driver: reads one operation per line, prints one result per line.
# "graph d|u <names>" numbers the vertices 0..n-1; "edge u v" adds an edge (an arc when d).
import sys

from bidirectional import bidirectional_bfs


def main():
    names, index, adj, radj, directed = [], {}, [], [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "d"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            adj = [[] for _ in names]
            radj = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            radj[v].append(u)
            if not directed:
                adj[v].append(u)
                radj[u].append(v)
        elif op == "search":
            for row in adj + radj:
                row.sort()
            path, expanded = bidirectional_bfs(adj, radj, index[args[0]], index[args[1]])
            if path is None:
                print("none |", expanded)
            else:
                print(len(path) - 1, "|", " ".join(names[v] for v in path), "|", expanded)


main()
