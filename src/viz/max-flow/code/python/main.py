# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "arc u v c" adds an arc.
import sys

from max_flow import max_flow


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
        elif op == "max-flow":
            n = len(names)
            cap = [[0] * n for _ in range(n)]
            for u, v, c in arcs:
                cap[u][v] = c
            value, paths, flow, side = max_flow(cap, index[args[0]], index[args[1]])
            flows = " ".join(f"{names[u]}>{names[v]}:{max(0, flow[u][v])}" for u, v, _ in arcs)
            print(f"{value} | {paths} | {' '.join(names[v] for v in side)} | {flows}")


main()
