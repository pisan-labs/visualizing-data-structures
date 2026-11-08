# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1; "edge u v" joins two; "build r" roots the
# tree at r and builds the table (no output); "lca u v" prints the answer.
import sys

from lca import BinaryLifting


def main():
    names, index, adj, table = [], {}, [], None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            adj = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            adj[u].append(v)
            adj[v].append(u)
        elif op == "build":
            table = BinaryLifting(adj, index[args[0]])
        elif op == "lca":
            print(names[table.lca(index[args[0]], index[args[1]])])


main()
