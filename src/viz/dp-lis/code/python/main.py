# Test driver: "table a1 a2 ..." (the O(n^2) method) or "tails a1 a2 ..." (binary search) prints
# the length of a longest increasing subsequence and the subsequence itself.
import sys

from lis import lis_table, lis_tails


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        a = [int(x) for x in parts[1:]]
        seq = lis_table(a) if parts[0] == "table" else lis_tails(a)
        print(" ".join(map(str, [len(seq)] + seq)))


main()
