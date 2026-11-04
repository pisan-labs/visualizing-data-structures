# Test driver: reads one operation per line, prints one result per line.
import sys

from btree import BTree


def main():
    tree = BTree(t=3)
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            if done:
                out.append(" ".join(["ok", *map(str, tree.keys())]))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) else "missing")
        elif op == "clear":
            tree = BTree(t=3)
            out.append("ok")
    print("\n".join(out))


main()
