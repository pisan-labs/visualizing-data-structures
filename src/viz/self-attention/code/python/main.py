# Test driver: reads one operation per line, prints one result per line.
# "w q|k|v rows cols <values>" sets a weight matrix; "clear" starts a sentence and
# "x <numbers>" adds a word's embedding. "attend causal scale" (1 or 0 each) prints the
# rows of A, a bar, and the rows of Z, three decimals each.
import math
import sys

from attention import self_attention


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def rows(m):
    return " / ".join(" ".join(three(v) for v in row) for row in m)


def main():
    w, x = {}, []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "w":
            r, c = int(args[1]), int(args[2])
            vals = [float(t) for t in args[3:]]
            w[args[0]] = [vals[i * c:(i + 1) * c] for i in range(r)]
        elif op == "clear":
            x = []
        elif op == "x":
            x.append([float(t) for t in args])
        elif op == "attend":
            a, z = self_attention(x, w["q"], w["k"], w["v"], args[0] == "1", args[1] == "1")
            print(rows(a), "|", rows(z))


main()
