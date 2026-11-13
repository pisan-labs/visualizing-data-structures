# Test driver: reads one operation per line, prints one result per line.
# "logits <word> <logit> ..." sets the logits. "softmax T" prints every word with its
# probability, most likely first. "sample strategy T k p ratio u" prints the kept words with
# their renormalized probabilities, a bar, and the word drawn.
import math
import sys

from sampling import cut, draw, most_likely_first, renormalize, softmax


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    words, logits = [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "logits":
            words, logits = args[0::2], [float(v) for v in args[1::2]]
        elif op == "softmax":
            p = softmax(logits, float(args[0]))
            print(" ".join(f"{words[i]} {three(p[i])}" for i in most_likely_first(p)))
        elif op == "sample":
            strategy, t, k, top_p, min_p, u = args
            p = softmax(logits, float(t))
            kept = cut(p, strategy, int(k), float(top_p), float(min_p))
            q = renormalize(p, kept)
            chosen = draw(q, kept, float(u))
            print(" ".join(f"{words[i]} {three(q[i])}" for i in kept), "|", words[chosen])


main()
