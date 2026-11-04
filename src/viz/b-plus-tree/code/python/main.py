# Test driver: reads one operation per line, prints one result per line.
import sys

from bplus_tree import BPlusTree


def main():
    tree = BPlusTree(m=4)
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        args = [int(p) for p in parts[1:]]
        if op in ("insert", "delete"):
            done = tree.insert(args[0]) if op == "insert" else tree.delete(args[0])
            if done:
                out.append(" ".join(["ok", *map(str, tree.keys())]))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(args[0]) else "missing")
        elif op == "range":
            keys = tree.range(args[0], args[1])
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = BPlusTree(m=4)
            out.append("ok")
    print("\n".join(out))


main()
