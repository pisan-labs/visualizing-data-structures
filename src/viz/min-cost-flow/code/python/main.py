# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "arc u v cap cost" adds an arc.
import sys

from min_cost_flow import min_cost_flow


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
            arcs.append((index[args[0]], index[args[1]], int(args[2]), int(args[3])))
        elif op == "min-cost-flow":
            n = len(names)
            cap = [[0] * n for _ in range(n)]
            cost = [[0] * n for _ in range(n)]
            for u, v, c, k in arcs:
                cap[u][v] = c
                cost[u][v] = k
            s, t, want = index[args[0]], index[args[1]], int(args[2])
            value, total, paths, flow = min_cost_flow(cap, cost, s, t, want)
            flows = " ".join(f"{names[u]}>{names[v]}:{max(0, flow[u][v])}" for u, v, _, _ in arcs)
            print(f"{value} {total} | {paths} | {flows}")


main()
