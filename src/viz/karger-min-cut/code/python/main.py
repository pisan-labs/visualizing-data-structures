# Test driver: reads one operation per line, prints one result per line.
# "graph <names>" numbers the vertices 0..n-1 in that order; "edge u v" adds an edge;
# "karger d1 d2 ..." runs one trial with those random draws and prints the cut.
import sys

from karger import karger


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
            edges.append((index[args[0]], index[args[1]]))
        elif op == "karger":
            draws = iter(int(d) for d in args)

            def randint(lo, hi):
                d = next(draws)
                assert lo <= d <= hi
                return d

            cut, group = karger(len(names), edges, randint)
            side = [names[v] for v in range(len(names)) if group[v] == group[0]]
            rest = [names[v] for v in range(len(names)) if group[v] != group[0]]
            print(f"{len(cut)} | {' '.join(side)} | {' '.join(rest)}".rstrip())


main()
