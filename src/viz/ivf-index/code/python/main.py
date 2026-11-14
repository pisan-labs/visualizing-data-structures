# Test driver: reads one operation per line, prints one result per line.
# "points x y x y ..." sets the points (no output). "train i1 ... ik" runs k-means
# from the points k-means++ chose and prints the centres and the lists ("-" for an
# empty list). "search x y k nprobe" prints the indices found and the distances
# computed. Three decimals.
import math
import sys

from ivf import IVFIndex, kmeans


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def ids(xs):
    return " ".join(str(i) for i in xs) if xs else "-"


def main():
    points, index = [], None
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "points":
            nums = [float(t) for t in args]
            points = [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
            index = None
        elif op == "train":
            centres = kmeans(points, [points[int(t)] for t in args])
            index = IVFIndex(points, centres)
            print(" / ".join(f"{three(x)} {three(y)}" for x, y in centres), "|",
                  " / ".join(ids(lst) for lst in index.lists))
        elif op == "search":
            q = (float(args[0]), float(args[1]))
            found, count = index.search(q, int(args[2]), int(args[3]))
            print(ids(found), "|", count)


main()
