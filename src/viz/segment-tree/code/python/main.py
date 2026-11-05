# Test driver: reads one operation per line, prints one line per query result.
#   build 5 3 8 1  |  query l r  |  update i x  |  add l r x
import sys

from segment_tree import SegmentTree


def main():
    tree = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "build":
            tree = SegmentTree(args)
        elif op == "query":
            print(tree.query(args[0], args[1]))
        elif op == "update":
            tree.update(args[0], args[1])
        elif op == "add":
            tree.add(args[0], args[1], args[2])


main()
