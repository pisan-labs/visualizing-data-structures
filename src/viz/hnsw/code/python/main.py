# Test driver: reads one operation per line, prints one result per line.
# "m M" starts an empty graph. "insert x y level" inserts a point at a given level and
# prints the distances computed, a bar, and its links on each layer from the top down
# ("-" for none). "search x y k ef" prints the ids found and the distances computed.
import sys

from hnsw import HNSW


def ids(xs):
    return " ".join(str(i) for i in xs) if xs else "-"


def main():
    g = HNSW()
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "m":
            g = HNSW(int(p[1]))
        elif p[0] == "insert":
            new = g.insert((int(p[1]), int(p[2])), int(p[3]))
            print(g.distances, "|", " / ".join(ids(layer) for layer in reversed(g.links[new])))
        elif p[0] == "search":
            found = g.search((int(p[1]), int(p[2])), int(p[3]), int(p[4]))
            print(ids(found), "|", g.distances)


main()
