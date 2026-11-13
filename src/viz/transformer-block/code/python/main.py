# Test driver: reads one operation per line, prints one result per line.
# "w <name> rows cols <values>" sets a weight matrix and "b <name> <values>" a bias;
# "vocab <words>" names the unembedding's columns; "clear" starts a sentence and
# "x <numbers>" adds a word's vector. None of these print. "run <pre|post> <layer|rms>
# <relu|gelu|swiglu>" prints the last word's attention weights, x1, x2 and the logits,
# three decimals each, and the guess, separated by bars.
import math
import sys

from block import block


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def row(v):
    return " ".join(three(t) for t in v)


def main():
    w, x, vocab = {}, [], []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "w":
            r, c = int(args[1]), int(args[2])
            vals = [float(t) for t in args[3:]]
            w[args[0]] = [vals[i * c:(i + 1) * c] for i in range(r)]
        elif op == "b":
            w[args[0]] = [float(t) for t in args[1:]]
        elif op == "vocab":
            vocab = args
        elif op == "clear":
            x = []
        elif op == "x":
            x.append([float(t) for t in args])
        elif op == "run":
            a, x1, x2, logits = block(x, w, args[0], args[1], args[2])
            top = max(logits)
            guess = next(i for i, v in enumerate(logits) if v >= top - 1e-9)
            print(" | ".join([row(a), row(x1), row(x2), row(logits), vocab[guess]]))


main()
