# Test driver: reads one operation per line, prints one result per line.
import sys

from interval_tree import IntervalTree


def preorder(x, out):
    if x is not None:
        out.append(f"{x.lo},{x.hi},{x.max}")
        preorder(x.left, out)
        preorder(x.right, out)


def main():
    tree = IntervalTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "clear":
            tree = IntervalTree()
            out.append("ok")
            continue
        lo, hi = int(parts[1]), int(parts[2])
        if op in ("insert", "delete"):
            done = tree.insert(lo, hi) if op == "insert" else tree.delete(lo, hi)
            if done:
                shape = []
                preorder(tree.root, shape)
                out.append(" ".join(map(str, ["ok", tree.size, tree.height(tree.root), *shape])))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "overlap":
            x, visited = tree.overlap(lo, hi)
            out.append(f"none {visited}" if x is None else f"{x.lo},{x.hi} {visited}")
        elif op == "all":
            found, visited = tree.all(lo, hi)
            words = [len(found), *(f"{x.lo},{x.hi}" for x in found), "visited", visited]
            out.append(" ".join(map(str, words)))
    print("\n".join(out))


main()
