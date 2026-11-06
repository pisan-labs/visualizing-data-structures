# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "edge u v w" adds an edge;
# "terminals <names>" sets the terminals.
import sys

from steiner import approx_steiner, exact_steiner_weight


def main():
    names, index, w, terminals = [], {}, [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            w = [[0] * len(names) for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            w[u][v] = w[v][u] = int(args[2])
        elif op == "terminals":
            terminals = sorted(index[a] for a in args)
        elif op == "steiner":
            tree = approx_steiner(w, terminals)
            weight = sum(w[u][v] for u, v in tree)
            shown = " ".join(f"{names[u]}-{names[v]}" for u, v in tree) or "-"
            print(weight, "|", shown, "|", exact_steiner_weight(w, terminals))


main()
