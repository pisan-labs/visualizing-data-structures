# Test driver: reads one operation per line, prints one result per line.
# "points x y x y ..." and "place x y ..." set the points and the centres (no output).
# "seed plus|random k u1 ... uk" prints the indices of the points chosen as centres.
# "assign" prints the labels and WCSS; "update farthest|stay" the centres and WCSS;
# "run farthest|stay" the rounds, the labels, the centres and WCSS. Three decimals.
import math
import sys

from kmeans import assign, kmeans_pp, lloyd, random_seeds, update, wcss


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def pairs(nums):
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]


def show(centres):
    return " / ".join(f"{three(x)} {three(y)}" for x, y in centres)


def main():
    points, centres, labels = [], [], None
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "points":
            points, centres, labels = pairs([float(t) for t in args]), [], None
        elif op == "place":
            centres, labels = pairs([float(t) for t in args]), None
        elif op == "seed":
            draws = iter([float(t) for t in args[2:]])
            seeds = kmeans_pp if args[0] == "plus" else random_seeds
            chosen = seeds(points, int(args[1]), lambda: next(draws))
            centres, labels = [points[i] for i in chosen], None
            print(" ".join(str(i) for i in chosen))
        elif op == "assign":
            labels = assign(points, centres)
            print(" ".join(str(c) for c in labels), "|", three(wcss(points, labels, centres)))
        elif op == "update":
            centres = update(points, labels, centres, args[0])
            print(show(centres), "|", three(wcss(points, labels, centres)))
        elif op == "run":
            centres, labels, rounds = lloyd(points, centres, labels, args[0])
            print(rounds, "|", " ".join(str(c) for c in labels), "|", show(centres), "|",
                  three(wcss(points, labels, centres)))


main()
