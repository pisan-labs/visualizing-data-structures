# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the cities 0..n-1 in that order; "edge u v w" sets a distance.
import sys

from tsp import approx_tsp_tour, held_karp, tour_length


def main():
    names, index, d = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            d = [[0] * len(names) for _ in names]
        elif op == "edge":
            u, v, w = index[args[0]], index[args[1]], int(args[2])
            d[u][v] = d[v][u] = w
        elif op == "tsp":
            tour = approx_tsp_tour(d)
            best, _ = held_karp(d)
            print(" ".join(names[c] for c in tour), "|", tour_length(d, tour), "|", best)


main()
