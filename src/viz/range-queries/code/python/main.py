# Test driver: reads one operation per line, prints one line per query result.
#   build 5 3 8 1  |  sum i j  |  min i j  |  update i x
import sys

from range_queries import PrefixSums, SparseTable


def main():
    sums = table = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(x) for x in parts[1:]]
        if op == "build":
            sums, table = PrefixSums(args), SparseTable(args)
        elif op == "sum":
            print(sums.sum(args[0], args[1]))
        elif op == "min":
            print(table.min(args[0], args[1]))
        elif op == "update":
            sums.update(args[0], args[1])
            table.update(args[0], args[1])


main()
