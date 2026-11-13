# Test driver: reads one operation per line, prints one result per line.
# "w rows cols <values>" sets the router; "clear" starts a sentence and "x <numbers>" adds a
# token. Neither prints. "route k cf token|expert" prints, for each token, its kept experts
# and weights ("2:0.818", "-" for none) separated by slashes; then the number of dropped
# assignments and of tokens with no expert; then the load-balance loss.
import math
import sys

from moe import route


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    w, x = [], []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "w":
            r, c = int(args[0]), int(args[1])
            vals = [float(t) for t in args[2:]]
            w = [vals[i * c:(i + 1) * c] for i in range(r)]
        elif op == "clear":
            x = []
        elif op == "x":
            x.append([float(t) for t in args])
        elif op == "route":
            assignments, cap, loss = route(x, w, int(args[0]), float(args[1]), args[2])
            per, dropped = [], 0
            for t in range(len(x)):
                kept = sorted((e, g) for tt, e, g, ok in assignments if tt == t and ok)
                per.append(",".join(f"{e + 1}:{three(g)}" for e, g in kept) or "-")
            dropped = sum(1 for a in assignments if not a[3])
            orphans = sum(1 for s in per if s == "-")
            print(f"{' / '.join(per)} | {dropped} {orphans} | {three(loss)}")


main()
