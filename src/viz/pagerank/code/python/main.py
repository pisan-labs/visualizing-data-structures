# Test driver: reads one operation per line, prints one result per line.
# "graph d|u <names>" numbers the vertices 0..n-1; "edge u v" adds a link (both ways when u).
# "pagerank d spread|drop" prints the iterations and each rank to three decimals.
import math
import sys

from pagerank import pagerank


def three(x):
    k = math.floor(x * 1000 + 0.5)
    return f"{k // 1000}.{k % 1000:03d}"


def main():
    names, index, links, directed = [], {}, [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "d"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            links = [[] for _ in names]
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            links[u].append(v)
            if not directed:
                links[v].append(u)
        elif op == "pagerank":
            rank, it = pagerank(len(names), links, float(args[0]), args[1] == "spread")
            print(it, "|", " ".join(three(x) for x in rank))


main()
