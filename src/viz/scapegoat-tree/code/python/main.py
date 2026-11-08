# Test driver: reads one operation per line, prints one result per line.
import sys

from scapegoat import ScapegoatTree


def preorder(x, out):
    if x is not None:
        out.append(x.key)
        preorder(x.left, out)
        preorder(x.right, out)


def inorder(x, out):
    if x is not None:
        inorder(x.left, out)
        out.append(x.key)
        inorder(x.right, out)


def main():
    tree = ScapegoatTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            before = tree.rebuilds
            done = tree.insert(k) if op == "insert" else tree.delete(k)
            if done:
                keys = []
                preorder(tree.root, keys)
                words = ["ok", tree.n, tree.height(tree.root), tree.rebuilds - before, *keys]
                out.append(" ".join(map(str, words)))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) else "missing")
        elif op == "inorder":
            keys = []
            inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = ScapegoatTree()
            out.append("ok")
    print("\n".join(out))


main()
