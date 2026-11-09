# Test driver: reads one operation per line, prints one result per line.
# "multiply n a11 a12 ... b11 b12 ..." gives A and B row by row; it prints the product, rows
# split by "; ", then "|", the scalar multiplications and the scalar additions.
import sys

from strassen import multiply


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "multiply":
            continue
        n = int(parts[1])
        xs = [int(x) for x in parts[2:]]
        A = [xs[i * n : (i + 1) * n] for i in range(n)]
        B = [xs[n * n + i * n : n * n + (i + 1) * n] for i in range(n)]
        C, count = multiply(A, B)
        rows = "; ".join(" ".join(str(x) for x in row) for row in C)
        print(f"{rows} | {count['mul']} {count['add']}")


main()
