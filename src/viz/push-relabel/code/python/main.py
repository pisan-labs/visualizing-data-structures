# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "arc u v c" adds an arc.
import sys

from push_relabel import push_relabel


def main():
    names, index, arcs = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            arcs = []
        elif op == "arc":
            arcs.append((index[args[0]], index[args[1]], int(args[2])))
        elif op == "push-relabel":
            n = len(names)
            cap = [[0] * n for _ in range(n)]
            for u, v, c in arcs:
                cap[u][v] = c
            value, pushes, relabels, flow, side = push_relabel(cap, index[args[0]], index[args[1]])
            flows = " ".join(f"{names[u]}>{names[v]}:{max(0, flow[u][v])}" for u, v, _ in arcs)
            side_names = " ".join(names[v] for v in side)
            print(f"{value} | {pushes} | {relabels} | {side_names} | {flows}")


main()
