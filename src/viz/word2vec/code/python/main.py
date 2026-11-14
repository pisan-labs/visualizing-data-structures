# Test driver: reads one operation per line, prints one result per line.
# "count word n" adds a word and its count; "noise" prints the noise distribution.
# "w word x y" and "c word x y" set a word's vectors. "pairs L words..." prints the
# pairs as center:context. "update lr k center context u..." draws k noise words with
# the u's, updates, and prints the noise words | the sigmoids | new w | new c.
import math
import sys

from word2vec import negatives, noise_distribution, pairs, update


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    counts, w, c = {}, {}, {}
    noise = {}
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op = p[0]
        if op == "count":
            counts[p[1]] = int(p[2])
            noise = noise_distribution(counts)
        elif op == "noise":
            print(" ".join(three(x) for x in noise.values()))
        elif op == "w":
            w[p[1]] = [float(p[2]), float(p[3])]
        elif op == "c":
            c[p[1]] = [float(p[2]), float(p[3])]
        elif op == "pairs":
            ps = pairs(p[2:], int(p[1]))
            print(" ".join(f"{a}:{b}" for a, b in ps) if ps else "-")
        elif op == "update":
            lr, k, center, context = float(p[1]), int(p[2]), p[3], p[4]
            us = iter(float(u) for u in p[5:])
            negs = negatives(noise, k, center, context, lambda: next(us))
            sigmas = update(w, c, center, context, negs, lr)
            print(" ".join(negs) if negs else "-", "|", " ".join(three(s) for s in sigmas),
                  "|", " ".join(three(x) for x in w[center]),
                  "|", " ".join(three(x) for x in c[context]))


main()
