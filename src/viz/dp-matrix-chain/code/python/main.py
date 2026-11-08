# Test driver: "cost p0 p1 ... pn" prints the fewest scalar multiplications for the chain;
# "order p0 p1 ... pn" prints that and the best order as nested brackets.
import sys

from matrix_chain import matrix_chain_order, parens


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 3:
            continue
        p = [int(x) for x in parts[1:]]
        n = len(p) - 1
        m, s = matrix_chain_order(p)
        if parts[0] == "cost":
            print(m[0][n - 1])
        elif parts[0] == "order":
            print(m[0][n - 1], parens(s, 0, n - 1))


main()
