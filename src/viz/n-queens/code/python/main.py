# Test driver: "first n" prints the columns of the first solution (from 1), "count n" prints
# how many solutions there are. One line in, one line out.
import sys

from queens import solve


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], int(parts[1])
        if op == "first":
            found = solve(n)
            print(" ".join(str(c + 1) for c in found[0]) if found else "none")
        elif op == "count":
            print(len(solve(n, first_only=False)))


main()
