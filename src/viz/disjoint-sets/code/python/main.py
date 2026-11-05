# Test driver: reads one operation per line, prints one result per line.
import sys

from disjoint_sets import DisjointSets


def main():
    ds = DisjointSets()
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "clear":
            ds = DisjointSets()
        elif op == "makeset":
            ds.make_set(args[0])
        elif op == "find":
            print(ds.find(args[0]))
        elif op == "union":
            root = ds.union(args[0], args[1])
            print("same" if root is None else root)
        elif op == "parents":
            print(" ".join(f"{x}:{ds.parent[x]}" for x in sorted(ds.parent)))


main()
