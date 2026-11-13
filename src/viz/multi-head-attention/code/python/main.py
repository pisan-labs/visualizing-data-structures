# Test driver: reads one operation per line, prints one result per line.
# "w q|k|v|o rows cols <values>" sets a weight matrix and "heads h h_kv" the heads; "clear"
# starts a sentence and "x <numbers>" adds a word's embedding. None of these print.
# "attend" prints each head's weights, then O, separated by bars, rows by slashes, three
# decimals each.
import math
import sys

from mha import multi_head_attention


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def rows(m):
    return " / ".join(" ".join(three(v) for v in row) for row in m)


def main():
    w, x, h, h_kv = {}, [], 1, 1
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "w":
            r, c = int(args[1]), int(args[2])
            vals = [float(t) for t in args[3:]]
            w[args[0]] = [vals[i * c:(i + 1) * c] for i in range(r)]
        elif op == "heads":
            h, h_kv = int(args[0]), int(args[1])
        elif op == "clear":
            x = []
        elif op == "x":
            x.append([float(t) for t in args])
        elif op == "attend":
            a, o = multi_head_attention(x, w["q"], w["k"], w["v"], w["o"], h, h_kv)
            print(" | ".join([rows(m) for m in a] + [rows(o)]))


main()
