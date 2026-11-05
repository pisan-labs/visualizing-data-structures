# Test driver: reads one operation per line, prints one line per query result.
#   build 5 3 8 1  |  add i delta  |  prefix i  |  sum l r
import sys

from fenwick_tree import FenwickTree


def main():
    tree = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "build":
            tree = FenwickTree(args)
        elif op == "add":
            tree.add(args[0], args[1])
        elif op == "prefix":
            print(tree.prefix(args[0]))
        elif op == "sum":
            print(tree.sum(args[0], args[1]))


main()
