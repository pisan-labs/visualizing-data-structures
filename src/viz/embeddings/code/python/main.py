# Test driver: reads one operation per line, prints one result per line.
# "word w x y" adds a word and "normalize" scales every vector to length 1; neither prints.
# "sim a b" prints the dot product and the cosine. "nearest cosine|dot k w" prints the k
# nearest words with their scores; "analogy cosine|dot k a b c" prints a - b + c, a bar, and
# the k nearest other words. Numbers have three decimals.
import math
import sys

from embeddings import analogy, cosine, dot, nearest, normalize


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def ranked(best):
    return " ".join(f"{w} {three(s)}" for w, s in best)


def main():
    words = []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "word":
            words.append((p[1], (float(p[2]), float(p[3]))))
        elif p[0] == "normalize":
            words = [(w, normalize(v)) for w, v in words]
        elif p[0] == "sim":
            vec = dict(words)
            a, b = vec[p[1]], vec[p[2]]
            print(three(dot(a, b)), three(cosine(a, b)))
        elif p[0] == "nearest":
            target = dict(words)[p[3]]
            print(ranked(nearest(words, target, int(p[2]), p[1], leave_out={p[3]})))
        elif p[0] == "analogy":
            t, best = analogy(words, p[3], p[4], p[5], int(p[2]), p[1])
            print(three(t[0]), three(t[1]), "|", ranked(best))


main()
