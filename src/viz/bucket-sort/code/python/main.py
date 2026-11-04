# Test driver: "load v1 v2 ..." replaces the array; "sort lo hi d" sorts it with buckets over
# [lo, hi) and prints it with d decimals.
import sys

from bucket_sort import bucket_sort


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [float(x) for x in parts[1:]]
        elif parts[0] == "sort":
            lo, hi, d = float(parts[1]), float(parts[2]), int(parts[3])
            bucket_sort(a, lo, hi)
            print(" ".join(f"{x:.{d}f}" for x in a))


main()
