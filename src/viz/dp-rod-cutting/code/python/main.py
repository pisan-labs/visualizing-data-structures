# Test driver: "revenue p1 p2 ... pn" prints the best revenue for a rod of length n;
# "cut p1 ... pn" prints the best revenue and the pieces, first piece first.
import sys

from rod import cut_rod


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        revenue, pieces = cut_rod([int(x) for x in parts[1:]])
        if parts[0] == "revenue":
            print(revenue)
        elif parts[0] == "cut":
            print(" ".join(map(str, [revenue] + pieces)))


main()
