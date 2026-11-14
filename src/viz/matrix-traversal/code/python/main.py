# Test driver: "load r c v1 v2 ..." replaces the matrix (r rows, c columns, row by row);
# "spiral" prints the values in spiral order; "rotate" turns it clockwise in place and prints
# its rows, separated by " / ".
import sys

from matrix import rotate, spiral_order


def main():
    m = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            rows, cols = int(parts[1]), int(parts[2])
            vs = [int(x) for x in parts[3:]]
            m = [vs[r * cols : (r + 1) * cols] for r in range(rows)]
        elif parts[0] == "spiral":
            print(*spiral_order(m))
        elif parts[0] == "rotate":
            rotate(m)
            print(" / ".join(" ".join(map(str, row)) for row in m))


main()
