# Test driver: reads one operation per line, prints one line per result.
# "settings bits scheme group" sets the options and "load <24 numbers>" the 4 x 6 weights, row
# by row; neither prints. "quantize" prints the codes, a bar, the decoded weights (three
# decimals), a bar, and the total |error|.
import math
import sys

from quantize import quantize_matrix

ROWS, COLS = 4, 6


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    bits, scheme, group, W = 8, "absmax", "tensor", None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "settings":
            bits, scheme, group = int(parts[1]), parts[2], parts[3]
        elif op == "load":
            vals = [float(t) for t in parts[1:]]
            W = [vals[r * COLS:(r + 1) * COLS] for r in range(ROWS)]
        elif op == "quantize":
            codes, decoded = quantize_matrix(W, bits, scheme, group)
            total = 0.0
            for r in range(ROWS):
                for c in range(COLS):
                    total += abs(decoded[r][c] - W[r][c])
            q = " ".join(str(x) for row in codes for x in row)
            d = " ".join(three(x) for row in decoded for x in row)
            print(f"{q} | {d} | {three(total)}")


main()
