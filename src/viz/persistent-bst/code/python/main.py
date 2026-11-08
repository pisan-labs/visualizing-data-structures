# Test driver: reads one operation per line, prints one result per line.
import sys

from persistent_bst import PersistentBST


def preorder(x, out):
    if x is not None:
        out.append(x.key)
        preorder(x.left, out)
        preorder(x.right, out)


def main():
    tree = PersistentBST()
    current = 0  # updates apply to the version being viewed
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "clear":
            tree, current = PersistentBST(), 0
            out.append("ok")
            continue
        n = int(parts[1])
        if op in ("insert", "delete"):
            v = tree.insert(current, n) if op == "insert" else tree.delete(current, n)
            if v is None:
                out.append("duplicate" if op == "insert" else "missing")
            else:
                current = v
                keys = []
                preorder(tree.versions[v], keys)
                out.append(" ".join(map(str, [f"v{v}", tree.made, *keys])))
        elif op == "search":
            out.append("found" if tree.search(current, n) else "missing")
        elif op == "view":
            current = n
            keys = []
            preorder(tree.versions[n], keys)
            out.append(" ".join(map(str, ["ok", *keys])))
    print("\n".join(out))


main()
