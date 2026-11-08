# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order.
import sys

from boruvka import boruvka


def main():
    names, index, edges = [], {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            names = args
            index = {name: i for i, name in enumerate(names)}
            edges = []
        elif op == "edge":
            edges.append((index[args[0]], index[args[1]], int(args[2])))
        elif op == "boruvka":
            total, tree = boruvka(len(names), edges)
            keys = [f"{names[edges[i][0]]}-{names[edges[i][1]]}" for i in tree]
            print(" ".join([str(total), "|", *keys]))


main()
