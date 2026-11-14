# Test driver: reads one operation per line, prints one result per line.
# "vectors a b c d a b c d ..." sets the vectors (no output). "train m k u1 ..."
# trains m codebooks of k centres with those k-means++ draws and prints them.
# "encode" prints every vector's code. "search a b c d k" prints the distance to
# every vector by the table, then the k nearest by it. Three decimals.
import math
import sys

from pq import PQ


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    vectors, pq, codes = [], None, []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "vectors":
            nums = [float(t) for t in args]
            vectors = [nums[i:i + 4] for i in range(0, len(nums), 4)]
        elif op == "train":
            pq = PQ(int(args[0]), int(args[1]))
            pq.train(vectors, [float(t) for t in args[2:]])
            print(" | ".join(" / ".join(" ".join(three(x) for x in c) for c in book)
                             for book in pq.books))
        elif op == "encode":
            codes = [pq.encode(v) for v in vectors]
            print(" / ".join(" ".join(str(c) for c in code) for code in codes))
        elif op == "search":
            q = [float(t) for t in args[:4]]
            dists, best = pq.search(q, codes, int(args[4]))
            print(" ".join(three(d) for d in dists), "|", " ".join(str(i) for i in best))


main()
