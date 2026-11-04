# Test driver: "length x y" prints the LCS length; "lcs x y" prints the length and one LCS.
import sys

from lcs import lcs, lcs_table


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 3:
            continue
        op, x, y = parts
        if op == "length":
            print(lcs_table(x, y)[len(x)][len(y)])
        elif op == "lcs":
            s = lcs(x, y)
            print(f"{len(s)} {s}".rstrip())


main()
