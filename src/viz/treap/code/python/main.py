# Test driver: reads one operation per line, prints one result per line.
import sys

from treap import Treap


def preorder(x, out):
    if x is not None:
        out.append(f"{x.key}:{x.priority}")
        preorder(x.left, out)
        preorder(x.right, out)


def main():
    tree = Treap()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        k = int(parts[1]) if len(parts) > 1 else None
        if op in ("insert", "delete"):
            before = tree.rotations
            done = tree.insert(k, int(parts[2])) if op == "insert" else tree.delete(k)
            if done:
                shape = []
                preorder(tree.root, shape)
                words = ["ok", tree.size, tree.height(tree.root), tree.rotations - before, *shape]
                out.append(" ".join(map(str, words)))
            else:
                out.append("duplicate" if op == "insert" else "missing")
        elif op == "search":
            out.append("found" if tree.search(k) else "missing")
        elif op in ("min", "max"):
            if tree.root is None:
                out.append("empty")
            else:
                x = tree.minimum() if op == "min" else tree.maximum()
                out.append(str(x.key))
        elif op == "inorder":
            keys = []
            tree.inorder(tree.root, keys)
            out.append(" ".join(map(str, keys)) or "empty")
        elif op == "clear":
            tree = Treap()
            out.append("ok")
    print("\n".join(out))


main()
