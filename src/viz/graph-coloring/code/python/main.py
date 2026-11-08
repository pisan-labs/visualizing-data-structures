# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "edge u v" joins two.
import sys

from coloring import greedy_color


def main():
    names, index, adj = [], {}, []
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
        elif op == "color":
            color = greedy_color(len(names), adj)
            print(max(color, default=0), "|", " ".join(map(str, color)))


main()
