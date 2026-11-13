# Test driver: reads one operation per line, prints one result per line.
# "p <word> <next> <probability>" adds a row of the model. "search <start> <B> <norm 1|0>
# <shrink|refill> <max length>" prints the finished hypotheses in the order they finished, each
# with its log-probability, then "=>" and the best.
import math
import sys

from beam import beam_search


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    model = {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "p":
            model.setdefault(args[0], []).append((args[1], float(args[2])))
        elif op == "search":
            start, width, norm, eos, max_len = args
            finished, best = beam_search(model, start, int(width), norm == "1", eos, int(max_len))
            done = " | ".join(f"{' '.join(ws)} {three(s)}" for ws, s in finished)
            print(done, "=>", " ".join(best[0]) if best else "none")


main()
